const moment = require('moment');
const { successResponse, errorResponse } = require('../../helper/index');
const doctorModel = require('../../model/doctor');
const doctorLeaveModel = require('../../model/doctorLeave');
const appointmentdetailModel = require('../../model/appointmentdetail');
const { getAppointmentDetails, formatBookingTime } = require('../../helper/appointmentHelper');
const { sendWhatsAppMessages } = require('../../helper/whatsappService');
const { getDoctorSlots, toDateOnly } = require('../../helper/availability');

// A hospital login may only touch its own doctors — mirrors the ownership
// check already used in updateDoctor (adminController.js).
const findOwnedDoctor = (doctorId, req) =>
    doctorModel.findOne({ _id: doctorId, delete: false, ...(req.hospitalId ? { hospitalId: req.hospitalId } : {}) });

// A date fits within a set of shifts if it's fully contained in at least
// one of them — same containment rule the slot engine itself uses.
const fitsWithinShifts = (dateStr, startTime, endTime, shifts) => {
    const start = moment(`${dateStr} ${startTime}`, 'YYYY-MM-DD HH:mm');
    const end = moment(`${dateStr} ${endTime}`, 'YYYY-MM-DD HH:mm');
    return shifts.some((shift) => {
        const shiftStart = moment(`${dateStr} ${shift.start}`, 'YYYY-MM-DD HH:mm');
        const shiftEnd = moment(`${dateStr} ${shift.end}`, 'YYYY-MM-DD HH:mm');
        return start.isSameOrAfter(shiftStart) && end.isSameOrBefore(shiftEnd);
    });
};

// Cancels (status:'Cancelled', not delete:true — stays visible, frees the
// slot) every still-active appointment for this doctor+date that no longer
// fits the new shifts, and notifies each affected patient via WhatsApp.
// Reuses the generic "appointment_cancel_v2" template (no dedicated
// "doctor unavailable" template is approved with the provider yet).
const cascadeCancelForLeave = async (doctorId, dateStr, type, shifts) => {
    const appointments = await appointmentdetailModel.find({
        doctorId,
        appointmentDate: toDateOnly(dateStr),
        delete: false,
        status: { $ne: 'Cancelled' },
    });

    for (const appt of appointments) {
        const stillFits = type === 'custom' && fitsWithinShifts(dateStr, appt.appointmentTime, appt.appointmentTime, shifts);
        if (stillFits) continue;

        appt.status = 'Cancelled';
        appt.update = new Date();
        await appt.save();

        try {
            const details = await getAppointmentDetails(appt.appointmentId);
            if (details?.patient?.mobileNumber) {
                await sendWhatsAppMessages('deleteAppointment', [details.patient.mobileNumber], {
                    patientName: details.patient.fullName,
                    doctorName: details.doctor?.name,
                    hospitalAddress: `${details.hospital?.address || ''}, ${details.hospital?.city || ''}, ${details.hospital?.state || ''}, ${details.hospital?.pincode || ''}`,
                    bookingTime: formatBookingTime(details.appointmentDate, details.appointmentTime),
                });
            }
        } catch (err) {
            // Notification failure shouldn't block the cancellation itself.
            console.error('Error sending doctor-unavailable WhatsApp notice:', err.message);
        }
    }

    return appointments.length;
};

const addDoctorLeave = async (req, res) => {
    try {
        const { doctorId, date, type = 'full', shifts = [], reason = '' } = req.body;
        if (!doctorId || !date) {
            return errorResponse(res, 'doctorId and date are required');
        }

        const doctor = await findOwnedDoctor(doctorId, req);
        if (!doctor) {
            return errorResponse(res, 'Doctor not found');
        }

        const dateStr = moment(date).format('YYYY-MM-DD');
        const normalizedShifts = type === 'custom'
            ? shifts.filter((s) => s && s.start && s.end).map((s) => ({ start: s.start, end: s.end }))
            : [];

        const leave = await doctorLeaveModel.findOneAndUpdate(
            { doctorId, date: toDateOnly(dateStr) },
            {
                doctorId,
                hospitalId: doctor.hospitalId,
                date: toDateOnly(dateStr),
                type,
                shifts: normalizedShifts,
                reason,
                delete: false,
                update: new Date(),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const cancelledCount = await cascadeCancelForLeave(doctorId, dateStr, type, normalizedShifts);

        return successResponse(res, 'Doctor leave saved successfully', { leave, cancelledAppointments: cancelledCount });
    } catch (error) {
        console.error('Error adding doctor leave:', error);
        return errorResponse(res, 'Error adding doctor leave: ' + error.message);
    }
};

const getDoctorLeaves = async (req, res) => {
    try {
        const { doctorId, month } = req.body; // month: 'YYYY-MM', optional
        if (!doctorId) {
            return errorResponse(res, 'doctorId is required');
        }

        const doctor = await findOwnedDoctor(doctorId, req);
        if (!doctor) {
            return errorResponse(res, 'Doctor not found');
        }

        const condition = { doctorId, delete: false };
        if (month) {
            const start = moment(month, 'YYYY-MM').startOf('month').toDate();
            const end = moment(month, 'YYYY-MM').endOf('month').toDate();
            condition.date = { $gte: start, $lte: end };
        }

        const leaves = await doctorLeaveModel.find(condition).sort({ date: 1 });
        return successResponse(res, 'Doctor leaves retrieved successfully', leaves);
    } catch (error) {
        console.error('Error getting doctor leaves:', error);
        return errorResponse(res, 'Error getting doctor leaves: ' + error.message);
    }
};

const deleteDoctorLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const leave = await doctorLeaveModel.findById(id);
        if (!leave) {
            return errorResponse(res, 'Leave entry not found');
        }

        const doctor = await findOwnedDoctor(leave.doctorId, req);
        if (!doctor) {
            return errorResponse(res, 'Leave entry not found');
        }

        leave.delete = true;
        await leave.save();

        return successResponse(res, 'Doctor leave removed successfully', []);
    } catch (error) {
        console.error('Error deleting doctor leave:', error);
        return errorResponse(res, 'Error deleting doctor leave: ' + error.message);
    }
};

// Feeds the red/available month calendar in the booking UI.
const getMonthAvailability = async (req, res) => {
    try {
        const { doctorId, month } = req.body; // month: 'YYYY-MM'
        if (!doctorId || !month) {
            return errorResponse(res, 'doctorId and month are required');
        }

        const doctor = await doctorModel.findOne({ _id: doctorId, delete: false, ...(req.hospitalId ? { hospitalId: req.hospitalId } : {}) });
        if (!doctor) {
            return errorResponse(res, 'Doctor not found');
        }

        const start = moment(month, 'YYYY-MM').startOf('month');
        const daysInMonth = start.daysInMonth();
        const dateStrs = Array.from({ length: daysInMonth }, (_, i) => start.clone().add(i, 'days').format('YYYY-MM-DD'));

        const results = await Promise.all(dateStrs.map(async (dateStr) => {
            const { dayStatus } = await getDoctorSlots(doctorId, dateStr);
            return { date: dateStr, status: dayStatus };
        }));

        return successResponse(res, 'Month availability retrieved successfully', results);
    } catch (error) {
        console.error('Error getting month availability:', error);
        return errorResponse(res, 'Error getting month availability: ' + error.message);
    }
};

module.exports = { addDoctorLeave, getDoctorLeaves, deleteDoctorLeave, getMonthAvailability };
