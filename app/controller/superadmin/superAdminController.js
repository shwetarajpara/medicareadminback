const moment = require('moment');
const mongoose = require('mongoose');
const adminModel = require('../../model/admin');
const hospitalModel = require('../../model/hospital');
const doctorModel = require('../../model/doctor');
const userModel = require('../../model/user');
const appointmentModel = require('../../model/appointment');
const appointmentdetailModel = require('../../model/appointmentdetail');
const IPD = require('../../model/ipd');
const { successResponse, errorResponse, updateModelStrict } = require('../../helper/index');
const { hashPassword } = require('../../helper/password');
const { parsePagination, paginationMeta, pageStages, searchRegex } = require('../../helper/pagination');

// Superadmin (token role 'admin') views across every hospital. Every route
// here is gated by requireRole('admin') in superAdmin.routes.js, so nothing
// in this file is hospital-scoped — that is the point of it.

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

// Platform-wide lists are never returned unpaginated (unlike the hospital
// lists, where pagination is opt-in) — "every appointment on the platform"
// is not a response size we want to ever produce by accident.
const DEFAULT_PAGE = { page: 1, limit: 20 };
const requirePagination = (body) => {
    const p = parsePagination({ ...DEFAULT_PAGE, ...body });
    return p.all ? parsePagination(DEFAULT_PAGE) : p;
};

const HOSPITAL_SAFE_FIELDS = {
    ownerName: 1, name: 1, email: 1, mobileNumber: 1, type: 1,
    address: 1, city: 1, state: 1, pincode: 1, latitude: 1, longitude: 1,
    socialMediaLinks: 1, specialization: 1, otherSpecialization: 1,
    certCode: 1, profile: 1, 'abdm.enabled': 1, create: 1, update: 1, delete: 1,
};

// `delete` doubles as the active flag: hospitalLogin/signin and the public
// hospital search all filter on delete:false, so a "deleted" hospital is
// exactly a deactivated one and can be restored by flipping it back.
const withActiveFlag = (h) => {
    const { delete: deleted, ...rest } = h;
    return { ...rest, isActive: !deleted };
};

// "Ongoing" is the legacy default and means "Booked" (see appointmentdetail.js).
const countByStatus = (groups) => groups.reduce((acc, s) => {
    const key = s._id === 'Ongoing' || !s._id ? 'Booked' : s._id;
    acc[key] = (acc[key] || 0) + s.count;
    return acc;
}, {});

// Browser's Date#getTimezoneOffset() (IST = -330) → "+05:30" for $dateToString.
const tzString = (offsetMinutes) => {
    const m = -offsetMinutes;
    const abs = Math.abs(m);
    return `${m >= 0 ? '+' : '-'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};

// Email/mobile are login identifiers, and signin + forgot-password look in
// hospitals first, then superadmins — so a value must be unique across both
// collections, not just within hospitals. Deactivated hospitals count too,
// since they can be reactivated.
const findLoginConflict = async ({ email, mobileNumber }, excludeHospitalId = null) => {
    const or = [];
    if (email) or.push({ email: String(email).trim() });
    if (mobileNumber) or.push({ mobileNumber: String(mobileNumber).trim() });
    if (!or.length) return null;

    const hospitalQuery = { $or: or };
    if (excludeHospitalId) hospitalQuery._id = { $ne: excludeHospitalId };

    const [hospital, admin] = await Promise.all([
        hospitalModel.findOne(hospitalQuery).select('email mobileNumber').lean(),
        adminModel.findOne({ $or: or, delete: false }).select('email mobileNumber').lean(),
    ]);
    const clash = hospital || admin;
    if (!clash) return null;
    return email && clash.email === String(email).trim()
        ? 'This email is already registered'
        : 'This mobile number is already registered';
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

// Body: { tzOffsetMinutes } — same convention as dashboardController, so
// "today" and the 7-day trend use the viewer's local calendar days.
const getDashboard = async (req, res) => {
    try {
        const offset = Number.isFinite(Number(req.body.tzOffsetMinutes)) ? Number(req.body.tzOffsetMinutes) : 0;
        const timezone = tzString(offset);
        const localNow = moment.utc().subtract(offset, 'minutes');
        const todayStart = localNow.clone().startOf('day').add(offset, 'minutes').toDate();
        const todayEnd = localNow.clone().endOf('day').add(offset, 'minutes').toDate();
        const weekStart = localNow.clone().subtract(6, 'days').startOf('day').add(offset, 'minutes').toDate();

        const [hospitalCounts, totalDoctors, totalPatients, [appt], topHospitals, recentHospitals, admittedIpd] = await Promise.all([
            hospitalModel.aggregate([{ $group: { _id: '$delete', count: { $sum: 1 } } }]),
            doctorModel.countDocuments({ delete: false }),
            userModel.countDocuments({ delete: false }),
            appointmentdetailModel.aggregate([
                { $match: { delete: false } },
                {
                    $facet: {
                        total: [{ $count: 'n' }],
                        today: [{ $match: { appointmentDate: { $gte: todayStart, $lte: todayEnd } } }, { $count: 'n' }],
                        emergency: [{ $match: { isEmergency: true } }, { $count: 'n' }],
                        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
                        weekly: [
                            { $match: { appointmentDate: { $gte: weekStart, $lte: todayEnd } } },
                            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$appointmentDate', timezone } }, count: { $sum: 1 } } },
                        ],
                    },
                },
            ]),
            appointmentModel.aggregate([
                { $match: { delete: false, hospitalId: { $ne: null } } },
                { $group: { _id: '$hospitalId', appointments: { $sum: 1 } } },
                { $sort: { appointments: -1 } },
                { $limit: 5 },
                { $lookup: { from: 'hospitals', localField: '_id', foreignField: '_id', as: 'h', pipeline: [{ $project: { name: 1, city: 1 } }] } },
                { $unwind: '$h' },
                { $project: { _id: 0, hospitalId: '$_id', name: '$h.name', city: '$h.city', appointments: 1 } },
            ]),
            hospitalModel.find({}, { name: 1, ownerName: 1, city: 1, create: 1, delete: 1 }).sort({ create: -1 }).limit(5).lean(),
            IPD.countDocuments({ delete: false, ipdStatus: 'Admitted' }),
        ]);

        const activeHospitals = hospitalCounts.find((c) => c._id === false)?.count || 0;
        const inactiveHospitals = hospitalCounts.find((c) => c._id === true)?.count || 0;
        const count = (arr) => arr[0]?.n || 0;

        const weeklyCounts = Object.fromEntries(appt.weekly.map((w) => [w._id, w.count]));
        const weeklyData = Array.from({ length: 7 }, (_, i) => {
            const d = localNow.clone().subtract(6 - i, 'days');
            const date = d.format('YYYY-MM-DD');
            return { date, day: d.format('ddd'), appointments: weeklyCounts[date] || 0 };
        });

        return successResponse(res, 'Dashboard fetched successfully', {
            hospitals: { total: activeHospitals + inactiveHospitals, active: activeHospitals, inactive: inactiveHospitals },
            totalDoctors,
            totalPatients,
            admittedIpdPatients: admittedIpd,
            appointments: {
                total: count(appt.total),
                today: count(appt.today),
                emergency: count(appt.emergency),
                byStatus: countByStatus(appt.byStatus),
            },
            weeklyData,
            topHospitals,
            recentHospitals: recentHospitals.map(withActiveFlag),
        });
    } catch (error) {
        console.error('Error fetching superadmin dashboard:', error);
        return errorResponse(res, 'Error fetching dashboard');
    }
};

// ---------------------------------------------------------------------------
// Hospitals
// ---------------------------------------------------------------------------

// Body: { page?, limit?, search?, status?: 'all'|'active'|'inactive', type?, city? }
const listHospitals = async (req, res) => {
    try {
        const pagination = requirePagination(req.body);
        const { status = 'all', type, city } = req.body;
        const search = searchRegex(req.body.search);

        const match = {};
        if (status === 'active') match.delete = false;
        if (status === 'inactive') match.delete = true;
        if (type) match.type = type;
        if (city) match.city = searchRegex(city);
        if (search) {
            match.$or = ['name', 'ownerName', 'email', 'mobileNumber', 'city', 'certCode'].map((f) => ({ [f]: search }));
        }

        const [facet] = await hospitalModel.aggregate([
            { $match: match },
            { $sort: { create: -1, _id: -1 } },
            {
                $facet: {
                    rows: [...pageStages(pagination), { $project: HOSPITAL_SAFE_FIELDS }],
                    total: [{ $count: 'n' }],
                },
            },
        ]);

        // Per-hospital counts for just this page, two grouped queries rather
        // than a $lookup per hospital over the whole collection.
        const ids = facet.rows.map((h) => h._id);
        const [doctorCounts, appointmentCounts] = await Promise.all([
            doctorModel.aggregate([
                { $match: { delete: false, hospitalId: { $in: ids } } },
                { $group: { _id: '$hospitalId', count: { $sum: 1 } } },
            ]),
            appointmentModel.aggregate([
                { $match: { delete: false, hospitalId: { $in: ids } } },
                { $group: { _id: '$hospitalId', count: { $sum: 1 }, lastAppointmentAt: { $max: '$create' } } },
            ]),
        ]);
        const doctorsBy = new Map(doctorCounts.map((d) => [String(d._id), d.count]));
        const apptsBy = new Map(appointmentCounts.map((a) => [String(a._id), a]));

        const hospitals = facet.rows.map((h) => ({
            ...withActiveFlag(h),
            doctorCount: doctorsBy.get(String(h._id)) || 0,
            appointmentCount: apptsBy.get(String(h._id))?.count || 0,
            lastAppointmentAt: apptsBy.get(String(h._id))?.lastAppointmentAt || null,
        }));

        return res.status(200).json({
            status: 200,
            message: 'Hospitals fetched successfully',
            data: { hospitals },
            pagination: paginationMeta(pagination, facet.total[0]?.n || 0),
        });
    } catch (error) {
        console.error('Error listing hospitals:', error);
        return errorResponse(res, 'Error fetching hospitals');
    }
};

// Body: { hospitalId } — profile, headline stats, doctors, recent appointments.
const getHospitalDetail = async (req, res) => {
    try {
        const hospitalId = toObjectId(req.body.hospitalId);
        const hospital = await hospitalModel.findById(hospitalId, HOSPITAL_SAFE_FIELDS).lean();
        if (!hospital) {
            return errorResponse(res, 'Hospital not found');
        }

        const appointmentIds = await appointmentModel
            .find({ hospitalId, delete: false }, { _id: 1 })
            .lean()
            .then((rows) => rows.map((r) => r._id));

        const todayStart = moment().startOf('day').toDate();
        const todayEnd = moment().endOf('day').toDate();

        const [doctors, [visits], uniquePatients, admittedIpd, recent] = await Promise.all([
            doctorModel.aggregate([
                { $match: { hospitalId, delete: false } },
                { $lookup: { from: 'specializations', localField: 'specializationId', foreignField: '_id', as: 's', pipeline: [{ $project: { name: 1 } }] } },
                {
                    $project: {
                        name: 1, email: 1, mobileNumber: 1, degree: 1, experience: 1, gender: 1,
                        appointmentCharge: 1, isAvailable: 1, profile: 1,
                        department: { $ifNull: [{ $arrayElemAt: ['$s.name', 0] }, null] },
                    },
                },
                { $sort: { name: 1 } },
            ]),
            appointmentdetailModel.aggregate([
                { $match: { delete: false, appointmentId: { $in: appointmentIds } } },
                {
                    $facet: {
                        total: [{ $count: 'n' }],
                        today: [{ $match: { appointmentDate: { $gte: todayStart, $lte: todayEnd } } }, { $count: 'n' }],
                        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
                    },
                },
            ]),
            appointmentModel.distinct('mobileNumber', { hospitalId, delete: false, mobileNumber: { $nin: ['', null] } }),
            IPD.countDocuments({ hospitalId, delete: false, ipdStatus: 'Admitted' }),
            queryAppointments({ appointmentIds }, parsePagination({ page: 1, limit: 10 })),
        ]);

        return successResponse(res, 'Hospital fetched successfully', {
            hospital: withActiveFlag(hospital),
            stats: {
                doctors: doctors.length,
                totalAppointments: visits.total[0]?.n || 0,
                todaysAppointments: visits.today[0]?.n || 0,
                uniquePatients: uniquePatients.length,
                admittedIpdPatients: admittedIpd,
                byStatus: countByStatus(visits.byStatus),
            },
            doctors,
            recentAppointments: recent.rows,
        });
    } catch (error) {
        console.error('Error fetching hospital detail:', error);
        return errorResponse(res, 'Error fetching hospital');
    }
};

// Runs before adminController.addHospital on /hospitals/register. That
// handler only rejects a duplicate email within hospitals; a mobile number
// or an email already used by a superadmin would make login ambiguous.
const ensureUniqueHospitalLogin = async (req, res, next) => {
    try {
        const conflict = await findLoginConflict(req.body);
        if (conflict) return errorResponse(res, conflict);
        next();
    } catch (error) {
        console.error('Error checking hospital login uniqueness:', error);
        return errorResponse(res, 'Error registering hospital');
    }
};

// Body: { hospitalId, ...editable fields } (multipart if `profile` is sent).
// Password is not editable here — see resetHospitalPassword.
const updateHospital = async (req, res) => {
    try {
        const { hospitalId } = req.body;
        const editable = [
            'ownerName', 'name', 'email', 'mobileNumber', 'type', 'address', 'city', 'state', 'pincode',
            'latitude', 'longitude', 'socialMediaLinks', 'specialization', 'otherSpecialization',
        ];
        const field = {};
        for (const key of editable) {
            if (req.body[key] !== undefined) field[key] = typeof req.body[key] === 'string' ? req.body[key].trim() : req.body[key];
        }
        if (field.specialization !== undefined && !Array.isArray(field.specialization)) {
            field.specialization = field.specialization ? [field.specialization] : [];
        }
        if (req.file) {
            // Same stored form addHospital uses for the profile image.
            field.profile = `admin/profiles/${req.file.filename}`;
        }
        if (!Object.keys(field).length) {
            return errorResponse(res, 'Nothing to update');
        }

        const conflict = await findLoginConflict(field, hospitalId);
        if (conflict) return errorResponse(res, conflict);

        field.update = Date.now();
        const updated = await updateModelStrict(hospitalModel, { _id: hospitalId }, field);
        const { password, content, ...safe } = updated.toObject();
        return successResponse(res, 'Hospital updated successfully', withActiveFlag(safe));
    } catch (error) {
        console.error('Error updating hospital:', error);
        return errorResponse(res, error.message === 'Data not found' ? 'Hospital not found' : 'Error updating hospital');
    }
};

// Body: { hospitalId, active } — deactivating blocks new logins and hides
// the hospital from patient search; data is kept and it can be reactivated.
const setHospitalStatus = async (req, res) => {
    try {
        const { hospitalId, active } = req.body;
        const result = await hospitalModel.updateOne(
            { _id: hospitalId },
            { $set: { delete: !active, update: Date.now() } }
        );
        if (!result.matchedCount) {
            return errorResponse(res, 'Hospital not found');
        }
        return successResponse(res, active ? 'Hospital activated' : 'Hospital deactivated', { hospitalId, isActive: !!active });
    } catch (error) {
        console.error('Error updating hospital status:', error);
        return errorResponse(res, 'Error updating hospital status');
    }
};

// Body: { hospitalId, newPassword } — for a hospital admin who is locked out
// and has no reachable mobile number for the OTP reset flow.
const resetHospitalPassword = async (req, res) => {
    try {
        const { hospitalId, newPassword } = req.body;
        const result = await hospitalModel.updateOne(
            { _id: hospitalId },
            { $set: { password: await hashPassword(newPassword), update: Date.now() } }
        );
        if (!result.matchedCount) {
            return errorResponse(res, 'Hospital not found');
        }
        return successResponse(res, 'Hospital password reset successfully');
    } catch (error) {
        console.error('Error resetting hospital password:', error);
        return errorResponse(res, 'Error resetting password');
    }
};

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

// Rows are appointmentdetail documents (one per visit — the collection that
// carries status/date), joined to their appointment for hospital + patient.
// Hospital filtering pre-resolves appointment ids (indexed on hospitalId)
// the same way patientController does, so the aggregation never scans every
// visit on the platform just to keep one hospital's.
async function queryAppointments(filters, pagination) {
    const { hospitalId, appointmentIds, doctorId, status, isEmergency, fromDate, toDate } = filters;
    const search = searchRegex(filters.search);

    const match = { delete: false };
    if (appointmentIds) {
        match.appointmentId = { $in: appointmentIds };
    } else if (hospitalId) {
        match.appointmentId = {
            $in: await appointmentModel
                .find({ hospitalId, delete: false }, { _id: 1 })
                .lean()
                .then((rows) => rows.map((r) => r._id)),
        };
    }
    if (doctorId) match.doctorId = toObjectId(doctorId);
    if (status) match.status = status === 'Booked' ? { $in: ['Booked', 'Ongoing'] } : status;
    if (isEmergency !== undefined) match.isEmergency = isEmergency === true || isEmergency === 'true';
    if (fromDate || toDate) {
        match.appointmentDate = {};
        if (fromDate) match.appointmentDate.$gte = moment(fromDate).startOf('day').toDate();
        if (toDate) match.appointmentDate.$lte = moment(toDate).endOf('day').toDate();
    }

    // Patient name/mobile: the appointment's own copy, else the linked user.
    const userStages = [
        { $lookup: { from: 'users', localField: 'appt.userId', foreignField: '_id', as: 'user', pipeline: [{ $project: { fullName: 1, mobileNumber: 1 } }] } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                patientName: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$appt.fullName', ''] } }, 0] }, '$appt.fullName', { $ifNull: ['$user.fullName', ''] }] },
                patientMobile: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$appt.mobileNumber', ''] } }, 0] }, '$appt.mobileNumber', { $ifNull: ['$user.mobileNumber', ''] }] },
            },
        },
    ];

    const [facet] = await appointmentdetailModel.aggregate([
        { $match: match },
        { $lookup: { from: 'appointments', localField: 'appointmentId', foreignField: '_id', as: 'appt' } },
        { $unwind: '$appt' },
        { $match: { 'appt.delete': false } },
        // Search needs the patient fields before filtering; otherwise the
        // user join is deferred to the page rows only.
        ...(search ? [...userStages, { $match: { $or: [{ patientName: search }, { patientMobile: search }] } }] : []),
        { $sort: { appointmentDate: -1, _id: -1 } },
        {
            $facet: {
                rows: [
                    ...pageStages(pagination),
                    ...(search ? [] : userStages),
                    { $lookup: { from: 'hospitals', localField: 'appt.hospitalId', foreignField: '_id', as: 'h', pipeline: [{ $project: { name: 1, city: 1 } }] } },
                    { $lookup: { from: 'doctors', localField: 'doctorId', foreignField: '_id', as: 'd', pipeline: [{ $project: { name: 1 } }] } },
                    { $lookup: { from: 'specializations', localField: 'departmentId', foreignField: '_id', as: 's', pipeline: [{ $project: { name: 1 } }] } },
                    {
                        $project: {
                            appointmentId: 1, appointmentDate: 1, appointmentTime: 1, startTime: 1, endTime: 1,
                            status: { $cond: [{ $in: [{ $ifNull: ['$status', 'Ongoing'] }, ['Ongoing']] }, 'Booked', '$status'] },
                            priority: 1, queueNumber: 1, isEmergency: 1, disease: 1, probableDiagnosis: 1,
                            amount: { $ifNull: ['$amount', '$appt.amount'] },
                            payableAmount: { $ifNull: ['$payableAmount', '$appt.payableAmount'] },
                            bookedAt: '$appt.create',
                            patient: { userId: '$appt.userId', name: '$patientName', mobileNumber: '$patientMobile' },
                            hospital: { $ifNull: [{ $arrayElemAt: ['$h', 0] }, null] },
                            doctor: { $ifNull: [{ $arrayElemAt: ['$d', 0] }, null] },
                            department: { $ifNull: [{ $arrayElemAt: ['$s', 0] }, null] },
                        },
                    },
                ],
                total: [{ $count: 'n' }],
            },
        },
    ]);

    return { rows: facet.rows, totalRecords: facet.total[0]?.n || 0 };
}

// Body: { page?, limit?, search?, hospitalId?, doctorId?, status?, isEmergency?, fromDate?, toDate? }
const listAppointments = async (req, res) => {
    try {
        const pagination = requirePagination(req.body);
        const { rows, totalRecords } = await queryAppointments(req.body, pagination);
        return res.status(200).json({
            status: 200,
            message: 'Appointments fetched successfully',
            data: { appointments: rows },
            pagination: paginationMeta(pagination, totalRecords),
        });
    } catch (error) {
        console.error('Error listing appointments:', error);
        return errorResponse(res, 'Error fetching appointments');
    }
};

// Body: { appointmentId } — the booking, every visit under it, and any IPD admission.
const getAppointmentDetail = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        const appointment = await appointmentModel
            .findOne({ _id: appointmentId, delete: false })
            .populate('userId', 'fullName mobileNumber gender dob abhaNumber abhaAddress')
            .populate('hospitalId', 'name ownerName city mobileNumber email')
            .populate('doctorId', 'name mobileNumber degree')
            .lean();
        if (!appointment) {
            return errorResponse(res, 'Appointment not found');
        }

        const [details, ipd] = await Promise.all([
            appointmentdetailModel
                .find({ appointmentId, delete: false })
                .populate('doctorId', 'name mobileNumber degree')
                .populate('departmentId', 'name')
                .sort({ appointmentDate: -1 })
                .lean(),
            IPD.find({ appointmentId, delete: false }).sort({ ipdAdmissionDate: -1 }).lean(),
        ]);

        return successResponse(res, 'Appointment fetched successfully', { appointment, details, ipd });
    } catch (error) {
        console.error('Error fetching appointment detail:', error);
        return errorResponse(res, 'Error fetching appointment');
    }
};

// ---------------------------------------------------------------------------
// Doctors & patients (platform-wide)
// ---------------------------------------------------------------------------

// Body: { page?, limit?, search?, hospitalId? }
const listDoctors = async (req, res) => {
    try {
        const pagination = requirePagination(req.body);
        const search = searchRegex(req.body.search);

        const match = { delete: false };
        if (req.body.hospitalId) match.hospitalId = toObjectId(req.body.hospitalId);
        if (search) match.$or = [{ name: search }, { email: search }, { mobileNumber: search }];

        const [facet] = await doctorModel.aggregate([
            { $match: match },
            { $sort: { create: -1, _id: -1 } },
            {
                $facet: {
                    rows: [
                        ...pageStages(pagination),
                        { $lookup: { from: 'hospitals', localField: 'hospitalId', foreignField: '_id', as: 'h', pipeline: [{ $project: { name: 1, city: 1 } }] } },
                        { $lookup: { from: 'specializations', localField: 'specializationId', foreignField: '_id', as: 's', pipeline: [{ $project: { name: 1 } }] } },
                        {
                            $project: {
                                name: 1, email: 1, mobileNumber: 1, degree: 1, experience: 1, gender: 1,
                                appointmentCharge: 1, isAvailable: 1, profile: 1, create: 1,
                                hospital: { $ifNull: [{ $arrayElemAt: ['$h', 0] }, null] },
                                department: { $ifNull: [{ $arrayElemAt: ['$s.name', 0] }, null] },
                            },
                        },
                    ],
                    total: [{ $count: 'n' }],
                },
            },
        ]);

        return res.status(200).json({
            status: 200,
            message: 'Doctors fetched successfully',
            data: { doctors: facet.rows },
            pagination: paginationMeta(pagination, facet.total[0]?.n || 0),
        });
    } catch (error) {
        console.error('Error listing doctors:', error);
        return errorResponse(res, 'Error fetching doctors');
    }
};

// Body: { page?, limit?, search? } — registered patient-app accounts
// (including family members managed under a primary account).
const listPatients = async (req, res) => {
    try {
        const pagination = requirePagination(req.body);
        const search = searchRegex(req.body.search);

        const match = { delete: false };
        if (search) match.$or = [{ fullName: search }, { mobileNumber: search }, { abhaNumber: search }];

        const [facet] = await userModel.aggregate([
            { $match: match },
            { $sort: { create: -1, _id: -1 } },
            {
                $facet: {
                    rows: [
                        ...pageStages(pagination),
                        {
                            $project: {
                                fullName: 1, mobileNumber: 1, gender: 1, dob: 1, address: 1, profile: 1,
                                abhaNumber: 1, abhaAddress: 1, managedBy: 1, relation: 1, create: 1,
                            },
                        },
                    ],
                    total: [{ $count: 'n' }],
                },
            },
        ]);

        const ids = facet.rows.map((u) => u._id);
        const visitCounts = await appointmentModel.aggregate([
            { $match: { delete: false, userId: { $in: ids } } },
            { $group: { _id: '$userId', count: { $sum: 1 }, hospitals: { $addToSet: '$hospitalId' }, lastBookedAt: { $max: '$create' } } },
        ]);
        const visitsBy = new Map(visitCounts.map((v) => [String(v._id), v]));

        // Last visited = latest appointment date that has already happened
        // and wasn't cancelled / a no-show (an upcoming booking isn't a visit).
        // Next visit = earliest booking from today on that hasn't been seen
        // yet ("Ongoing" is the legacy name for "Booked").
        const appts = await appointmentModel.find({ delete: false, userId: { $in: ids } }, { _id: 1, userId: 1 }).lean();
        const userByAppt = new Map(appts.map((a) => [String(a._id), String(a.userId)]));
        const details = appts.length
            ? await appointmentdetailModel.aggregate([
                { $match: { delete: false, appointmentId: { $in: appts.map((a) => a._id) }, appointmentDate: { $ne: null } } },
                {
                    $group: {
                        _id: '$appointmentId',
                        lastAt: {
                            $max: {
                                $cond: [
                                    { $and: [
                                        { $lte: ['$appointmentDate', moment().endOf('day').toDate()] },
                                        { $not: [{ $in: ['$status', ['Cancelled', 'NoShow']] }] },
                                        // Today's booking counts only once the patient is
                                        // actually seen; until then it's the next visit.
                                        { $or: [
                                            { $lt: ['$appointmentDate', moment().startOf('day').toDate()] },
                                            { $not: [{ $in: [{ $ifNull: ['$status', 'Booked'] }, ['Booked', 'Ongoing']] }] },
                                        ] },
                                    ] },
                                    '$appointmentDate',
                                    null,
                                ],
                            },
                        },
                        nextAt: {
                            $min: {
                                $cond: [
                                    { $and: [
                                        { $gte: ['$appointmentDate', moment().startOf('day').toDate()] },
                                        { $in: [{ $ifNull: ['$status', 'Booked'] }, ['Booked', 'Ongoing']] },
                                    ] },
                                    '$appointmentDate',
                                    null,
                                ],
                            },
                        },
                    },
                },
            ])
            : [];
        const lastVisitedBy = new Map();
        const nextVisitBy = new Map();
        for (const d of details) {
            const userId = userByAppt.get(String(d._id));
            if (!userId) continue;
            if (d.lastAt && (!lastVisitedBy.has(userId) || d.lastAt > lastVisitedBy.get(userId))) lastVisitedBy.set(userId, d.lastAt);
            if (d.nextAt && (!nextVisitBy.has(userId) || d.nextAt < nextVisitBy.get(userId))) nextVisitBy.set(userId, d.nextAt);
        }

        const patients = facet.rows.map((u) => {
            const v = visitsBy.get(String(u._id));
            return {
                ...u,
                appointmentCount: v?.count || 0,
                hospitalsVisited: v ? v.hospitals.filter(Boolean).length : 0,
                lastBookedAt: v?.lastBookedAt || null,
                lastVisitedAt: lastVisitedBy.get(String(u._id)) || null,
                nextVisitAt: nextVisitBy.get(String(u._id)) || null,
            };
        });

        return res.status(200).json({
            status: 200,
            message: 'Patients fetched successfully',
            data: { patients },
            pagination: paginationMeta(pagination, facet.total[0]?.n || 0),
        });
    } catch (error) {
        console.error('Error listing patients:', error);
        return errorResponse(res, 'Error fetching patients');
    }
};

module.exports = {
    getDashboard,
    listHospitals,
    getHospitalDetail,
    ensureUniqueHospitalLogin,
    updateHospital,
    setHospitalStatus,
    resetHospitalPassword,
    listAppointments,
    getAppointmentDetail,
    listDoctors,
    listPatients,
};
