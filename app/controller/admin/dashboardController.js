const moment = require('moment');
const appointmentModel = require('../../model/appointment');
const appointmentdetailModel = require('../../model/appointmentdetail');
const IPD = require('../../model/ipd');
const hospitalModel = require('../../model/hospital');
const { errorResponse } = require('../../helper/index');
const { scopeFilter } = require('../../middleware/scope');

// Dashboard numbers, computed server-side. The Dashboard used to download
// every appointment and every IPD record on each visit and work these out
// in the browser; now it receives only the few KB it actually displays.
//
// Body: { tzOffsetMinutes } — the browser's Date#getTimezoneOffset(), so
// "today" and the last-7-days chart use the clinic's local dates even
// though the server runs in UTC.
const getDashboardStats = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.body.hospitalId;
        if (!hospitalId) {
            return errorResponse(res, 'hospitalId is required');
        }

        const offset = Number.isFinite(Number(req.body.tzOffsetMinutes)) ? Number(req.body.tzOffsetMinutes) : 0;
        // A UTC instant → the clinic's local calendar day, as YYYY-MM-DD.
        const localDay = (date) => moment.utc(date).subtract(offset, 'minutes').format('YYYY-MM-DD');
        const todayLocal = localDay(new Date());

        const [appointments, hospital, admittedIpdPatients] = await Promise.all([
            appointmentModel
                .find({ hospitalId, delete: false }, { userId: 1, fullName: 1, create: 1 })
                .populate('userId', 'fullName')
                .lean(),
            hospitalModel.findById(hospitalId, { city: 1 }).lean(),
            IPD.countDocuments(scopeFilter(req, { delete: false, ipdStatus: 'Admitted' })),
        ]);

        const appointmentById = new Map(appointments.map((a) => [String(a._id), a]));
        const details = await appointmentdetailModel
            .find(
                { delete: false, appointmentId: { $in: appointments.map((a) => a._id) } },
                { appointmentId: 1, disease: 1, probableDiagnosis: 1, status: 1, isEmergency: 1, appointmentDate: 1 }
            )
            .lean();

        // Same rules the Dashboard applied in the browser.
        const patientKey = (a) => String(a.userId?._id || a.userId || a._id);
        const uniquePatients = new Set();
        const ongoingPatients = new Set();
        const appointmentsWithVisits = new Set();
        const diseaseCounts = new Map();
        let todaysAppointments = 0;
        let emergencyCount = 0;

        // Last 7 local days, oldest first, e.g. [{ date: '2026-10-11', day: 'Sun' }, …]
        const last7 = Array.from({ length: 7 }, (_, i) => {
            const d = moment(todayLocal, 'YYYY-MM-DD').subtract(6 - i, 'days');
            return { date: d.format('YYYY-MM-DD'), day: d.format('ddd') };
        });
        const weeklyCounts = Object.fromEntries(last7.map((d) => [d.date, 0]));

        const recentCandidates = [];

        for (const d of details) {
            const appt = appointmentById.get(String(d.appointmentId));
            if (!appt) continue;
            const pid = patientKey(appt);
            uniquePatients.add(pid);
            appointmentsWithVisits.add(String(appt._id));

            const disease = d.disease || d.probableDiagnosis || 'Unknown';
            diseaseCounts.set(disease, (diseaseCounts.get(disease) || 0) + 1);

            if (String(d.status || '').toLowerCase() === 'ongoing') ongoingPatients.add(pid);
            if (d.isEmergency === true) emergencyCount += 1;

            if (d.appointmentDate) {
                const day = localDay(d.appointmentDate);
                if (day === todayLocal) todaysAppointments += 1;
                if (day in weeklyCounts) weeklyCounts[day] += 1;
            }

            const createdAt = appt.create || d.appointmentDate;
            recentCandidates.push({
                id: pid,
                name: appt.fullName || appt.userId?.fullName || 'Unknown',
                condition: disease,
                status: d.status || 'Unknown',
                sortDate: createdAt ? new Date(createdAt).getTime() : 0,
                lastVisitAt: createdAt || null,
            });
        }

        // Recent patients: newest first, one row per patient, top 10.
        recentCandidates.sort((a, b) => b.sortDate - a.sortDate);
        const seen = new Set();
        const recentPatients = [];
        for (const c of recentCandidates) {
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            recentPatients.push({ id: c.id, name: c.name, condition: c.condition, status: c.status, lastVisitAt: c.lastVisitAt });
            if (recentPatients.length >= 10) break;
        }

        return res.status(200).json({
            status: 200,
            message: 'Dashboard stats fetched successfully',
            data: {
                totalPatients: uniquePatients.size,
                todaysAppointments,
                ongoingTreatments: ongoingPatients.size,
                emergencyCount,
                admittedIpdPatients,
                diseaseData: [...diseaseCounts.entries()]
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value),
                // Every appointment belongs to this hospital, so this is one
                // bar: the hospital's city with its appointment count.
                cityData: hospital?.city ? [{ name: hospital.city, patients: appointmentsWithVisits.size }] : [],
                weeklyData: last7.map((d) => ({ day: d.day, date: d.date, appointments: weeklyCounts[d.date] })),
                recentPatients,
            },
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return errorResponse(res, 'Error fetching dashboard stats');
    }
};

module.exports = { getDashboardStats };
