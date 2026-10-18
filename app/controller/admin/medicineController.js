const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../../helper/index');
const Appointment = require('../../model/appointment');
const AppointmentDetail = require('../../model/appointmentdetail');
const IPD = require('../../model/ipd');
const IpdDetail = require('../../model/ipdDetails');
const { scopeFilter } = require('../../middleware/scope');

// Medicines already prescribed to the patient behind `appointmentId`
// (OPD appointment details + IPD round entries), for the prescription
// form's autocomplete. "Same patient" = same mobile number or same patient
// account, within the caller's hospital — app bookings may have no
// mobileNumber on the appointment, staff bookings may have no userId.
//
// Returns { medicines, lastPrescription }:
//   medicines        — one row per distinct medicine name, carrying the
//                      timing/meal/days it was MOST RECENTLY prescribed
//                      with (so the form can pre-fill them)
//   lastPrescription — every row of the patient's most recent prescription
//                      (for "Repeat Previous Prescription")
const getPatientMedicines = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        if (!mongoose.isValidObjectId(appointmentId)) {
            return errorResponse(res, 'Valid appointmentId is required');
        }

        const appointment = await Appointment.findOne(scopeFilter(req, { _id: appointmentId }));
        if (!appointment) {
            return successResponse(res, 'Patient medicines fetched successfully', { medicines: [], lastPrescription: [] });
        }

        const samePatient = [{ _id: appointment._id }];
        if (appointment.mobileNumber) samePatient.push({ mobileNumber: appointment.mobileNumber });
        if (appointment.userId) samePatient.push({ userId: appointment.userId });

        const appointmentIds = await Appointment.find(scopeFilter(req, { $or: samePatient })).distinct('_id');
        const ipdIds = await IPD.find(scopeFilter(req, { appointmentId: { $in: appointmentIds } })).distinct('_id');

        const hasRx = { 'prescriptions.0': { $exists: true } };
        const [opdEntries, ipdEntries] = await Promise.all([
            AppointmentDetail.find({ appointmentId: { $in: appointmentIds }, delete: false, ...hasRx })
                .select('prescriptions update create').lean(),
            IpdDetail.find({ ipdId: { $in: ipdIds }, delete: false, ...hasRx })
                .select('prescriptions instructionDate create').lean(),
        ]);

        // Newest entry first, across OPD and IPD.
        const entries = [
            ...opdEntries.map((e) => ({ at: e.update || e.create, prescriptions: e.prescriptions })),
            ...ipdEntries.map((e) => ({ at: e.instructionDate || e.create, prescriptions: e.prescriptions })),
        ].sort((a, b) => new Date(b.at) - new Date(a.at));

        const clean = (p) => ({
            medicineName: String(p.medicineName || '').trim(),
            timing: p.timing || [],
            mealInstruction: p.mealInstruction || '',
            days: p.days || '',
        });

        // Case-insensitive de-dupe ("Paracetamol" vs "paracetamol"); walking
        // newest-first means the kept row has the most recent settings.
        const byKey = new Map();
        entries.forEach((e) => e.prescriptions.forEach((p) => {
            const row = clean(p);
            const key = row.medicineName.toLowerCase();
            if (row.medicineName && !byKey.has(key)) byKey.set(key, row);
        }));

        const medicines = [...byKey.values()].sort((a, b) => a.medicineName.localeCompare(b.medicineName));
        const lastPrescription = entries.length
            ? entries[0].prescriptions.map(clean).filter((p) => p.medicineName)
            : [];

        return successResponse(res, 'Patient medicines fetched successfully', { medicines, lastPrescription });
    } catch (error) {
        console.error('Error fetching patient medicines:', error);
        return errorResponse(res, 'Error fetching patient medicines');
    }
};

module.exports = { getPatientMedicines };
