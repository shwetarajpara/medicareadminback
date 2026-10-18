const moment = require('moment');
const appointmentdetailModel = require('../../model/appointmentdetail');
const doctorModel = require('../../model/doctor');
const { successResponse, errorResponse, updateModelStrict } = require('../../helper/index');
const { computeQueueProjection } = require('../../helper/appointmentHelper');

// appointmentdetail has no hospitalId of its own — tenancy is scoped via the
// doctor it belongs to. req.hospitalId is only set when the caller is a
// hospital-role token (always, from the token itself) or a superadmin who
// supplied one; a superadmin with none is left unscoped on purpose.
const assertDoctorInHospital = async (doctorId, req) => {
    if (!req.hospitalId) return doctorModel.findById(doctorId);
    return doctorModel.findOne({ _id: doctorId, hospitalId: req.hospitalId });
};

// Legal status transitions for the queue state machine.
const TRANSITIONS = {
    Booked: ['CheckedIn', 'Cancelled', 'NoShow'],
    Ongoing: ['CheckedIn', 'Cancelled', 'NoShow'], // legacy status, treated like Booked
    CheckedIn: ['InConsultation', 'Cancelled', 'NoShow'],
    InConsultation: ['Completed', 'Cancelled'],
    Completed: [],
    NoShow: ['Booked'], // allow re-booking into the queue
    Cancelled: [],
};

// Statuses that may legally transition INTO `target`, derived from TRANSITIONS
// so the two can't drift apart.
const sourcesFor = (target) => Object.keys(TRANSITIONS).filter((from) => TRANSITIONS[from].includes(target));

// Loads an appointment detail, verifies it belongs to a doctor in the
// caller's hospital (IDOR guard), then applies an atomically status-guarded
// transition — the guard also closes the race where two requests both read
// a "transitionable" status and both try to act on it; only one write wins.
const transitionDetail = async (appointmentDetailId, targetStatus, extraUpdate, req) => {
    const detail = await appointmentdetailModel.findOne({ _id: appointmentDetailId, delete: false });
    if (!detail) return { error: 'Appointment detail not found' };

    const doctor = await assertDoctorInHospital(detail.doctorId, req);
    if (!doctor) return { error: 'Appointment detail not found' };

    const fromStatuses = sourcesFor(targetStatus);
    if (!fromStatuses.includes(detail.status)) {
        return { error: `Cannot transition from status "${detail.status}"` };
    }

    const updated = await appointmentdetailModel.findOneAndUpdate(
        { _id: appointmentDetailId, status: { $in: fromStatuses } },
        { $set: { status: targetStatus, ...extraUpdate } },
        { new: true, runValidators: true, context: 'query' }
    );
    if (!updated) return { error: 'This appointment was already updated by someone else — refresh and try again' };
    return { updated };
};

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const fetchDoctorAndEntries = async (doctorId, date, req) => {
    const doctor = await assertDoctorInHospital(doctorId, req);
    const dayStart = moment(date).startOf('day').toDate();
    const dayEnd = moment(date).endOf('day').toDate();

    const entries = await appointmentdetailModel.find({
        doctorId,
        appointmentDate: { $gte: dayStart, $lte: dayEnd },
        delete: false
    })
        .populate('userId', 'fullName mobileNumber gender')
        .sort({ appointmentTime: 1 })
        .lean();

    return { doctor, entries };
};

const getTodayQueue = async (req, res) => {
    try {
        const { doctorId, date } = req.body;

        if (!doctorId) {
            return errorResponse(res, 'doctorId is required');
        }

        const queueDate = date || moment().format('YYYY-MM-DD');
        const { doctor, entries } = await fetchDoctorAndEntries(doctorId, queueDate, req);

        if (!doctor) {
            return errorResponse(res, 'Doctor not found');
        }

        const { waiting, inConsultation, effectiveAvg } = computeQueueProjection(
            entries, doctor.averageAppointmentTime, queueDate
        );

        const completed = entries.filter(e => e.status === 'Completed');
        const noShow = entries.filter(e => e.status === 'NoShow');

        return successResponse(res, 'Queue fetched successfully', {
            date: queueDate,
            averageConsultationTime: effectiveAvg,
            nowServing: inConsultation || null,
            waiting,
            completed,
            noShow,
            totalToday: entries.length,
        });
    } catch (error) {
        console.error('Error fetching queue:', error);
        return errorResponse(res, 'Error fetching queue');
    }
};

const getQueueStatus = async (req, res) => {
    try {
        const { doctorId, date } = req.body;

        if (!doctorId) {
            return errorResponse(res, 'doctorId is required');
        }

        const queueDate = date || moment().format('YYYY-MM-DD');
        const { doctor, entries } = await fetchDoctorAndEntries(doctorId, queueDate, req);

        if (!doctor) {
            return errorResponse(res, 'Doctor not found');
        }

        const { waiting, inConsultation, effectiveAvg } = computeQueueProjection(
            entries, doctor.averageAppointmentTime, queueDate
        );

        return successResponse(res, 'Queue status fetched successfully', {
            nowServingId: inConsultation?._id || null,
            waitingCount: waiting.length,
            averageConsultationTime: effectiveAvg,
            nextExpectedStartTime: waiting[0]?.expectedStartTime || null,
        });
    } catch (error) {
        console.error('Error fetching queue status:', error);
        return errorResponse(res, 'Error fetching queue status');
    }
};

const checkInPatient = async (req, res) => {
    try {
        const { appointmentDetailId } = req.body;
        if (!appointmentDetailId) {
            return errorResponse(res, 'appointmentDetailId is required');
        }

        const { updated, error } = await transitionDetail(appointmentDetailId, 'CheckedIn', {
            checkedInAt: new Date(),
            inTime: moment().format('HH:mm'),
            update: new Date(),
        }, req);
        if (error) return errorResponse(res, error);

        return successResponse(res, 'Patient checked in successfully', updated);
    } catch (error) {
        console.error('Error checking in patient:', error);
        return errorResponse(res, 'Error checking in patient');
    }
};

const callNextPatient = async (req, res) => {
    try {
        const { doctorId, date } = req.body;
        if (!doctorId) {
            return errorResponse(res, 'doctorId is required');
        }

        const queueDate = date || moment().format('YYYY-MM-DD');
        const { doctor, entries } = await fetchDoctorAndEntries(doctorId, queueDate, req);
        if (!doctor) {
            return errorResponse(res, 'Doctor not found');
        }

        const alreadyInConsultation = entries.find(e => e.status === 'InConsultation');
        if (alreadyInConsultation) {
            return errorResponse(res, 'A patient is already in consultation with this doctor');
        }

        const { waiting } = computeQueueProjection(entries, doctor.averageAppointmentTime, queueDate);
        const checkedInWaiting = waiting.filter(w => w.status === 'CheckedIn');

        if (checkedInWaiting.length === 0) {
            return errorResponse(res, 'No checked-in patients waiting');
        }

        const next = checkedInWaiting[0];
        // Status-guarded so two concurrent calls can't both promote a patient:
        // if another request already moved this entry out of CheckedIn, this
        // update matches nothing and we report that instead of double-calling.
        const updated = await appointmentdetailModel.findOneAndUpdate(
            { _id: next._id, status: 'CheckedIn' },
            { $set: { status: 'InConsultation', consultStartAt: new Date(), update: new Date() } },
            { new: true, runValidators: true, context: 'query' }
        );
        if (!updated) {
            return errorResponse(res, 'This patient was already called by someone else — refresh and try again');
        }

        return successResponse(res, 'Next patient called', updated);
    } catch (error) {
        console.error('Error calling next patient:', error);
        return errorResponse(res, 'Error calling next patient');
    }
};

const startConsultation = async (req, res) => {
    try {
        const { appointmentDetailId } = req.body;
        if (!appointmentDetailId) {
            return errorResponse(res, 'appointmentDetailId is required');
        }

        const { updated, error } = await transitionDetail(appointmentDetailId, 'InConsultation', {
            consultStartAt: new Date(),
            update: new Date(),
        }, req);
        if (error) return errorResponse(res, error);

        return successResponse(res, 'Consultation started', updated);
    } catch (error) {
        console.error('Error starting consultation:', error);
        return errorResponse(res, 'Error starting consultation');
    }
};

const completeConsultation = async (req, res) => {
    try {
        const { appointmentDetailId } = req.body;
        if (!appointmentDetailId) {
            return errorResponse(res, 'appointmentDetailId is required');
        }

        const { updated, error } = await transitionDetail(appointmentDetailId, 'Completed', {
            consultEndAt: new Date(),
            outTime: moment().format('HH:mm'),
            update: new Date(),
        }, req);
        if (error) return errorResponse(res, error);

        return successResponse(res, 'Consultation completed', updated);
    } catch (error) {
        console.error('Error completing consultation:', error);
        return errorResponse(res, 'Error completing consultation');
    }
};

const setQueuePriority = async (req, res) => {
    try {
        const { appointmentDetailId, priority } = req.body;
        if (!appointmentDetailId || !priority) {
            return errorResponse(res, 'appointmentDetailId and priority are required');
        }
        if (!['Normal', 'Priority', 'Emergency'].includes(priority)) {
            return errorResponse(res, 'priority must be Normal, Priority, or Emergency');
        }

        const detail = await appointmentdetailModel.findOne({ _id: appointmentDetailId, delete: false });
        if (!detail) {
            return errorResponse(res, 'Appointment detail not found');
        }
        const doctor = await assertDoctorInHospital(detail.doctorId, req);
        if (!doctor) {
            return errorResponse(res, 'Appointment detail not found');
        }

        const updated = await updateModelStrict(appointmentdetailModel, { _id: appointmentDetailId }, {
            priority,
            isEmergency: priority === 'Emergency',
            update: new Date(),
        });

        return successResponse(res, 'Priority updated', updated);
    } catch (error) {
        console.error('Error updating priority:', error);
        return errorResponse(res, 'Error updating priority');
    }
};

const markNoShow = async (req, res) => {
    try {
        const { appointmentDetailId } = req.body;
        if (!appointmentDetailId) {
            return errorResponse(res, 'appointmentDetailId is required');
        }

        const { updated, error } = await transitionDetail(appointmentDetailId, 'NoShow', {
            update: new Date(),
        }, req);
        if (error) return errorResponse(res, error);

        return successResponse(res, 'Marked as no-show', updated);
    } catch (error) {
        console.error('Error marking no-show:', error);
        return errorResponse(res, 'Error marking no-show');
    }
};

module.exports = {
    getTodayQueue,
    getQueueStatus,
    checkInPatient,
    callNextPatient,
    startConsultation,
    completeConsultation,
    setQueuePriority,
    markNoShow,
};
