const moment = require('moment');
const mongoose = require('mongoose');
const appointmentModel = require('../../model/appointment');
const appointmentdetailModel = require('../../model/appointmentdetail');
const doctorModel = require('../../model/doctor');
const IPD = require('../../model/ipd');
const IpdDetail = require('../../model/ipdDetails');
const { errorResponse } = require('../../helper/index');
const { scopeFilter } = require('../../middleware/scope');
const { parseDateFilter } = require('../../helper/dateFilter');
const { parsePagination, paginationMeta, pageStages, searchRegex } = require('../../helper/pagination');

// Appointments that never turned into a visit — ignored for "last visited".
const NOT_VISITED_STATUSES = ['Cancelled', 'NoShow'];
// Booked and not seen yet — "Ongoing" is the legacy name for "Booked".
const UPCOMING_STATUSES = ['Booked', 'Ongoing'];

// Non-empty string from the appointment, else the linked user's value.
const preferAppointment = (field, fallback) => ({
    $cond: [
        { $gt: [{ $strLenCP: { $ifNull: [`$appt.${field}`, ''] } }, 0] },
        `$appt.${field}`,
        { $ifNull: [`$user.${field}`, fallback] },
    ],
});

// Patients = this hospital's appointment visits grouped by mobile number
// (the same "unique patient" rule the Patients page used to apply in the
// browser after downloading every appointment). Paginated server-side by
// patient, with search on name/mobile and an optional visit-date range.
//
// Body: { page?, limit?, search?, dateFilter? } — without `page` every
// patient is returned (used by the CSV export).
const getPatients = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.body.hospitalId;
        if (!hospitalId) {
            return errorResponse(res, 'hospitalId is required');
        }

        const pagination = parsePagination(req.body);
        const search = searchRegex(req.body.search);
        // Today / this week / this month / last month / custom range.
        const range = parseDateFilter(req.body);

        const hospitalAppointmentIds = await appointmentModel
            .find({ hospitalId, delete: false }, { _id: 1 })
            .lean()
            .then((rows) => rows.map((r) => r._id));

        const match = { delete: false, appointmentId: { $in: hospitalAppointmentIds } };
        if (range) match.appointmentDate = range;

        const pipeline = [
            { $match: match },
            { $lookup: { from: 'appointments', localField: 'appointmentId', foreignField: '_id', as: 'appt' } },
            { $unwind: '$appt' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'appt.userId',
                    foreignField: '_id',
                    as: 'user',
                    pipeline: [{ $project: { fullName: 1, mobileNumber: 1, abhaNumber: 1, abhaAddress: 1 } }],
                },
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    patientMobile: preferAppointment('mobileNumber', 'N/A'),
                    patientName: preferAppointment('fullName', 'N/A'),
                },
            },
            ...(search ? [{ $match: { $or: [{ patientName: search }, { patientMobile: search }] } }] : []),
            { $sort: { appointmentDate: -1, _id: -1 } },
            {
                $group: {
                    _id: '$patientMobile',
                    name: { $first: '$patientName' },
                    userId: { $first: { $ifNull: ['$appt.userId', '$user._id'] } },
                    email: { $first: '$appt.email' },
                    abhaNumber: { $first: '$user.abhaNumber' },
                    abhaAddress: { $first: '$user.abhaAddress' },
                    lastVisitAt: { $max: '$appointmentDate' },
                    // Shown as "Last visit": only a visit that has actually
                    // happened — not an upcoming booking, a cancellation or a
                    // no-show. ($max skips the nulls.)
                    lastVisitedAt: {
                        $max: {
                            $cond: [
                                {
                                    $and: [
                                        { $lte: ['$appointmentDate', moment().endOf('day').toDate()] },
                                        { $not: [{ $in: ['$status', NOT_VISITED_STATUSES] }] },
                                        // Today's booking counts only once the patient is
                                        // actually seen; until then it's the next visit.
                                        { $or: [
                                            { $lt: ['$appointmentDate', moment().startOf('day').toDate()] },
                                            { $not: [{ $in: [{ $ifNull: ['$status', 'Booked'] }, UPCOMING_STATUSES] }] },
                                        ] },
                                    ],
                                },
                                '$appointmentDate',
                                null,
                            ],
                        },
                    },
                    // Shown as "Next visit": the earliest booking from today on
                    // that hasn't been seen yet ($min skips the nulls).
                    nextVisitAt: {
                        $min: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ['$appointmentDate', moment().startOf('day').toDate()] },
                                        { $in: [{ $ifNull: ['$status', 'Booked'] }, UPCOMING_STATUSES] },
                                    ],
                                },
                                '$appointmentDate',
                                null,
                            ],
                        },
                    },
                    totalVisits: { $sum: 1 },
                    diseases: { $addToSet: '$disease' },
                    appointments: {
                        $push: {
                            _id: '$_id',
                            appointmentDate: '$appointmentDate',
                            appointmentTime: '$appointmentTime',
                            disease: '$disease',
                            careContextLinkedAt: '$careContextLinkedAt',
                        },
                    },
                },
            },
            { $sort: { lastVisitAt: -1, _id: 1 } },
            {
                $facet: {
                    rows: pagination ? pageStages(pagination) : [],
                    summary: [
                        { $group: { _id: null, totalPatients: { $sum: 1 }, totalAppointments: { $sum: '$totalVisits' } } },
                    ],
                },
            },
        ];

        const [facet] = await appointmentdetailModel.aggregate(pipeline);
        const summary = facet.summary[0] || { totalPatients: 0, totalAppointments: 0 };

        const patients = facet.rows.map((p) => ({
            id: p._id,
            userId: p.userId || null,
            name: p.name || 'N/A',
            phone: p._id,
            email: p.email || 'N/A',
            abhaNumber: p.abhaNumber || null,
            abhaAddress: p.abhaAddress || null,
            appointments: p.appointments,
            totalVisits: p.totalVisits,
            lastVisit: p.lastVisitedAt ? moment(p.lastVisitedAt).format('DD MMM YYYY') : '—',
            lastVisitedAt: p.lastVisitedAt || null,
            nextVisit: p.nextVisitAt ? moment(p.nextVisitAt).format('DD MMM YYYY') : '—',
            nextVisitAt: p.nextVisitAt || null,
            diseases: (p.diseases || []).filter(Boolean),
        }));

        return res.status(200).json({
            status: 200,
            message: 'Patients fetched successfully',
            data: {
                patients,
                totalPatients: summary.totalPatients,
                totalAppointments: summary.totalAppointments,
            },
            ...(pagination ? { pagination: paginationMeta(pagination, summary.totalPatients) } : {}),
        });
    } catch (error) {
        console.error('Error fetching patients:', error);
        return errorResponse(res, 'Error fetching patients');
    }
};

// A patient's past medical records at the caller's hospital: every OPD
// appointment's clinical note (complaints, prescription, lab report + file,
// advice, suggested next appointment) and every IPD round entry, newest
// first. "Same patient" = same mobile number or same patient account — the
// rule medicineController uses (app bookings may have no mobileNumber on
// the appointment, staff bookings may have no userId).
//
// Body: { mobileNumber?, userId? } (at least one), plus hospitalId for the
// superadmin (hospital staff are scoped by their token).
const getPatientRecords = async (req, res) => {
    try {
        const { mobileNumber, userId } = req.body;
        const samePatient = [];
        if (mobileNumber && mobileNumber !== 'N/A') samePatient.push({ mobileNumber: String(mobileNumber) });
        if (userId && mongoose.isValidObjectId(userId)) samePatient.push({ userId });
        if (!samePatient.length) {
            return errorResponse(res, 'mobileNumber or userId is required');
        }

        const appointments = await appointmentModel
            .find(scopeFilter(req, { delete: false, $or: samePatient }), { _id: 1, doctorId: 1, disease: 1 })
            .lean();
        const appointmentIds = appointments.map((a) => a._id);
        const apptById = new Map(appointments.map((a) => [String(a._id), a]));
        const ipds = await IPD.find(scopeFilter(req, { delete: false, appointmentId: { $in: appointmentIds } }), { _id: 1, doctorId: 1 }).lean();
        const ipdById = new Map(ipds.map((i) => [String(i._id), i]));

        const [opd, ipd] = await Promise.all([
            appointmentdetailModel.find({ delete: false, appointmentId: { $in: appointmentIds } }).lean(),
            IpdDetail.find({ delete: false, ipdId: { $in: ipds.map((i) => i._id) } }).lean(),
        ]);

        // Doctor names for every record in one query.
        const doctorIds = new Set();
        opd.forEach((d) => { const id = d.doctorId || apptById.get(String(d.appointmentId))?.doctorId; if (id) doctorIds.add(String(id)); });
        ipd.forEach((d) => { const id = d.doctorId || ipdById.get(String(d.ipdId))?.doctorId; if (id) doctorIds.add(String(id)); });
        const doctors = await doctorModel.find({ _id: { $in: [...doctorIds] } }, { name: 1 }).lean();
        const doctorName = new Map(doctors.map((d) => [String(d._id), d.name]));
        const nameOf = (id) => (id ? doctorName.get(String(id)) || null : null);

        const prescriptionsOf = (rows) => (Array.isArray(rows) ? rows : [])
            .filter((p) => String(p.medicineName || '').trim())
            .map((p) => ({ medicineName: p.medicineName, timing: p.timing || [], mealInstruction: p.mealInstruction || '', days: p.days || '' }));

        const records = [
            ...opd.map((d) => {
                const prescriptions = prescriptionsOf(d.prescriptions);
                return {
                    _id: d._id,
                    type: 'OPD',
                    date: d.appointmentDate || d.create,
                    time: d.appointmentTime || '',
                    status: d.status === 'Ongoing' ? 'Booked' : d.status || 'Booked',
                    doctorName: nameOf(d.doctorId || apptById.get(String(d.appointmentId))?.doctorId),
                    disease: d.disease || apptById.get(String(d.appointmentId))?.disease || '',
                    complaints: d.chiefComplaints || '',
                    probableDiagnosis: d.probableDiagnosis || '',
                    labInvestigations: d.labInvestigations || '',
                    labReport: d.labReportNotes || '',
                    labReportFile: d.labReports || '',
                    advice: d.advice || '',
                    remarks: d.doctorRemarks || '',
                    prescriptions,
                    // Older notes only have the free-text prescription.
                    legacyPrescription: prescriptions.length ? '' : d.prescriptionList || '',
                    nextAppointmentDate: d.nextAppointmentDate || null,
                };
            }),
            ...ipd.map((d) => ({
                _id: d._id,
                type: 'IPD',
                date: d.instructionDate || d.create,
                time: d.instructionDate ? moment(d.instructionDate).format('HH:mm') : '',
                status: 'IPD round',
                doctorName: nameOf(d.doctorId || ipdById.get(String(d.ipdId))?.doctorId),
                disease: '',
                complaints: d.complaints || '',
                labInvestigations: d.labInvestigations || '',
                labReport: d.labReport || '',
                labReportFile: d.labReportFile || '',
                advice: d.advice || '',
                remarks: d.remarks || '',
                prescriptions: prescriptionsOf(d.prescriptions),
                instructions: d.instructions ? [{ description: d.instructions }] : [],
            })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        // The most recent suggested follow-up, for the patient summary.
        const suggested = records.find((r) => r.nextAppointmentDate);

        return res.status(200).json({
            status: 200,
            message: 'Patient records fetched successfully',
            data: { records, suggestedNextAppointmentDate: suggested?.nextAppointmentDate || null },
        });
    } catch (error) {
        console.error('Error fetching patient records:', error);
        return errorResponse(res, 'Error fetching patient records');
    }
};

module.exports = { getPatients, getPatientRecords };
