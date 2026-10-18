// Patient-facing medical history — appointments (with prescriptions), IPD
// admissions/rounds, and bills, for the logged-in account and any family
// member it manages. Every query is scoped by getOwnedUserIds(req), never
// by hospital — a patient's history spans every hospital on the platform,
// unlike the hospital-dashboard equivalents these mirror.
const mongoose = require('mongoose');
const appointmentdetailModel = require('../../model/appointmentdetail');
const ipdModel = require('../../model/ipd');
const ipdDetailsModel = require('../../model/ipdDetails');
const billModel = require('../../model/bill');
const { successResponse, errorResponse } = require('../../helper/index');
const { getOwnedUserIds } = require('../../helper/familyAccess');

// Mirrors adminController.getAppointmentsWithDetails's aggregation shape,
// but scoped to the caller's owned userIds across all hospitals instead of
// one hospital's hospitalId.
const getMyAppointments = async (req, res) => {
    try {
        const ownedIds = (await getOwnedUserIds(req)).map((id) => new mongoose.Types.ObjectId(id));

        const pipeline = [
            { $match: { delete: false } },
            {
                $lookup: {
                    from: 'appointments',
                    localField: 'appointmentId',
                    foreignField: '_id',
                    as: 'appointmentData'
                }
            },
            { $unwind: '$appointmentData' },
            { $match: { 'appointmentData.userId': { $in: ownedIds } } },
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'appointmentData.doctorId',
                    foreignField: '_id',
                    as: 'appointmentData.doctor',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'specializations',
                                localField: 'specializationId',
                                foreignField: '_id',
                                as: 'specialization'
                            }
                        },
                        { $unwind: { path: '$specialization', preserveNullAndEmptyArrays: true } },
                        { $project: { name: 1, mobileNumber: 1, specialization: '$specialization.name', profile: 1 } }
                    ]
                }
            },
            {
                $lookup: {
                    from: 'hospitals',
                    localField: 'appointmentData.hospitalId',
                    foreignField: '_id',
                    as: 'appointmentData.hospital',
                    pipeline: [{ $project: { name: 1, address: 1, city: 1 } }]
                }
            },
            {
                $project: {
                    duration: 1,
                    appointmentTime: 1,
                    appointmentDate: 1,
                    disease: 1,
                    isEmergency: 1,
                    status: 1,
                    chiefComplaints: 1,
                    probableDiagnosis: 1,
                    prescriptionList: 1,
                    prescriptions: 1,
                    labInvestigations: 1,
                    labReports: 1,
                    labReportNotes: 1,
                    advice: 1,
                    doctorRemarks: 1,
                    nextAppointmentDate: 1,
                    appointmentData: 1,
                }
            },
            { $sort: { appointmentDate: -1, appointmentTime: -1 } },
        ];

        const results = await appointmentdetailModel.aggregate(pipeline);
        return successResponse(res, 'Appointments fetched successfully', results);
    } catch (error) {
        console.error('Error fetching patient appointments:', error);
        return errorResponse(res, 'Error fetching appointments');
    }
};

const getMyIpdHistory = async (req, res) => {
    try {
        const ownedIds = await getOwnedUserIds(req);
        const admissions = await ipdModel.find({ userId: { $in: ownedIds }, delete: false })
            .populate('doctorId', 'name mobileNumber')
            .populate('hospitalId', 'name address city')
            .sort({ ipdAdmissionDate: -1 });

        return successResponse(res, 'IPD history fetched successfully', admissions);
    } catch (error) {
        console.error('Error fetching patient IPD history:', error);
        return errorResponse(res, 'Error fetching IPD history');
    }
};

const getMyIpdInstructions = async (req, res) => {
    try {
        const { ipdId } = req.body;
        if (!ipdId) {
            return errorResponse(res, 'ipdId is required');
        }

        const ownedIds = await getOwnedUserIds(req);
        const admission = await ipdModel.findOne({ _id: ipdId, delete: false });
        if (!admission || !ownedIds.includes(String(admission.userId))) {
            return errorResponse(res, 'IPD record not found');
        }

        const instructions = await ipdDetailsModel.find({ ipdId, delete: false })
            .populate({ path: 'doctorId', select: 'name specializationId', populate: { path: 'specializationId', select: 'name' } })
            .sort({ create: -1 });

        return successResponse(res, 'IPD instructions fetched successfully', instructions);
    } catch (error) {
        console.error('Error fetching patient IPD instructions:', error);
        return errorResponse(res, 'Error fetching IPD instructions');
    }
};

// Deliberately a separate, freshly-scoped function rather than a route onto
// adminController/billingController's getBillingHistory — that one trusts
// whatever userId/mobile is in the request body with no ownership check at
// all, which is only safe behind its existing staff-only gate.
const getMyBills = async (req, res) => {
    try {
        const ownedIds = await getOwnedUserIds(req);
        const bills = await billModel.find({ userId: { $in: ownedIds }, delete: false })
            .populate('hospitalId', 'name address city')
            .populate('doctorId', 'name')
            .sort({ create: -1 });

        return successResponse(res, 'Bills fetched successfully', bills);
    } catch (error) {
        console.error('Error fetching patient bills:', error);
        return errorResponse(res, 'Error fetching bills');
    }
};

module.exports = { getMyAppointments, getMyIpdHistory, getMyIpdInstructions, getMyBills };
