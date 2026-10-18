// careContextController.js — ABDM "HIP-Initiated Linking" (part of M2, the
// lightweight half). Registers a consultation as existing for a patient's
// ABHA so it shows up in their ABHA-linked timeline — no clinical data
// (diagnosis, prescription text, etc.) is sent, just metadata: a care
// context id, a display label, and a health-information-type tag. Actual
// clinical data only ever moves later, through the separate consent-gated
// data-flow pipeline (not built — see the plan/memory note).

const axios = require('axios');
const userModel = require('../../model/user');
const hospitalModel = require('../../model/hospital');
const appointmentdetailModel = require('../../model/appointmentdetail');
const moment = require('moment');
const { successResponse, errorResponse, updateModel } = require('../../helper/index');
const { buildStandardHeaders, getBaseUrls } = require('../../helper/abdmClient');

const requireAbdmEnabled = async (hospitalId) => {
    if (!hospitalId) return false;
    const hospital = await hospitalModel.findById(hospitalId).select('abdm');
    return !!hospital?.abdm?.enabled;
};

// hiType values ABDM defines — map Queueless's record types onto them.
const HI_TYPES = {
    consultation: 'OPConsultation',
    prescription: 'Prescription',
    labReport: 'DiagnosticReport',
    discharge: 'DischargeSummary',
};

const linkCareContext = async (req, res) => {
    try {
        const { hospitalId, appointmentDetailId, hiType = 'consultation' } = req.body;

        if (!(await requireAbdmEnabled(hospitalId))) {
            return errorResponse(res, 'ABHA integration is not enabled for this hospital');
        }
        if (!appointmentDetailId) {
            return errorResponse(res, 'appointmentDetailId is required');
        }

        const detail = await appointmentdetailModel.findById(appointmentDetailId).populate('userId');
        if (!detail) {
            return errorResponse(res, 'Appointment detail not found');
        }
        if (detail.careContextLinkedAt) {
            return errorResponse(res, 'This consultation is already linked to the patient\'s ABHA');
        }

        const patient = detail.userId;
        if (!patient?.abhaAddress && !patient?.abhaNumber) {
            return errorResponse(res, 'This patient does not have an ABHA linked yet — link one first');
        }

        const { gateway } = getBaseUrls();
        const headers = await buildStandardHeaders();

        // Step 1: a short-lived link token scoped to this patient's ABHA.
        const tokenResponse = await axios.post(`${gateway}/api/hiecm/v3/token/generate-token`, {
            abhaAddress: patient.abhaAddress || patient.abhaNumber,
        }, { headers });
        const linkToken = tokenResponse.data?.linkToken || tokenResponse.data?.token;

        if (!linkToken) {
            console.error('Unexpected generate-token response:', JSON.stringify(tokenResponse.data));
            return errorResponse(res, 'Could not obtain a link token from ABDM — check server logs');
        }

        // Step 2: register this consultation as a care context using that token.
        const displayLabel = `${detail.disease || 'Consultation'} — ${moment(detail.appointmentDate).format('DD MMM YYYY')}`;
        await axios.post(`${gateway}/api/hiecm/hip/v3/link/carecontext`, {
            linkToken,
            patient: [{
                referenceNumber: String(patient._id),
                display: patient.fullName,
                careContexts: [{
                    referenceNumber: String(detail._id),
                    display: displayLabel,
                    hiType: HI_TYPES[hiType] || HI_TYPES.consultation,
                }],
            }],
        }, { headers: await buildStandardHeaders() });

        const updated = await updateModel(appointmentdetailModel, { _id: appointmentDetailId }, {
            careContextLinkedAt: new Date(), update: new Date(),
        });

        return successResponse(res, 'Linked to the patient\'s ABHA successfully', { careContextLinkedAt: updated.careContextLinkedAt });
    } catch (error) {
        console.error('Error linking care context:', error.response?.data || error.message);
        return errorResponse(res, error.response?.data?.message || error.message || 'Error linking to ABHA');
    }
};

module.exports = { linkCareContext };
