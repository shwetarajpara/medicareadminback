const moment = require('moment');
const appointmentModel = require('../../model/appointment');
const appointmentdetailModel = require('../../model/appointmentdetail');
const { errorResponse } = require('../../helper/index');
const { parsePagination, paginationMeta, pageStages, searchRegex } = require('../../helper/pagination');

// Same named ranges the Patients page has always offered.
const dateRange = (dateFilter) => {
    switch (dateFilter) {
        case 'today':
            return [moment().startOf('day'), moment().endOf('day')];
        case 'week':
            return [moment().startOf('week'), moment().endOf('week')];
        case 'month':
            return [moment().startOf('month'), moment().endOf('month')];
        case 'lastMonth':
            return [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')];
        default:
            return null;
    }
};

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
        const range = dateRange(req.body.dateFilter);

        const hospitalAppointmentIds = await appointmentModel
            .find({ hospitalId, delete: false }, { _id: 1 })
            .lean()
            .then((rows) => rows.map((r) => r._id));

        const match = { delete: false, appointmentId: { $in: hospitalAppointmentIds } };
        if (range) match.appointmentDate = { $gte: range[0].toDate(), $lte: range[1].toDate() };

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
            lastVisit: p.lastVisitAt ? moment(p.lastVisitAt).format('DD MMM YYYY') : '—',
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

module.exports = { getPatients };
