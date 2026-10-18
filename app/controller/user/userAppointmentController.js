// Patient self-service booking — for the logged-in account itself or any
// family member it manages (see app/helper/familyAccess.js). Shares the
// exact same slot-resolution and record-creation logic the hospital
// dashboard uses (app/helper/availability.js, app/helper/appointmentHelper.js's
// createAppointmentRecord) so capacity accounting can never drift between
// the staff and patient booking paths.
const userModel = require('../../model/user');
const { successResponse, errorResponse } = require('../../helper/index');
const { getHourlyAvailability } = require('../../helper/availability');
const { createAppointmentRecord } = require('../../helper/appointmentHelper');
const { getOwnedUserIds } = require('../../helper/familyAccess');

const getAvailableSlots = async (req, res) => {
    try {
        const { doctorId, date } = req.body;
        if (!doctorId || !date) {
            return errorResponse(res, 'doctorId and date are required');
        }

        const { hours, dayStatus } = await getHourlyAvailability(doctorId, date);
        const availableSlots = hours.map((hour) => ({
            startTime: hour.start,
            endTime: hour.end,
            timeRange: `${hour.start}-${hour.end}`,
            available: hour.available,
        }));

        return successResponse(res, 'Available slots fetched successfully', { doctorId, date, dayStatus, availableSlots });
    } catch (error) {
        console.error('Error fetching available slots:', error);
        return errorResponse(res, 'Error fetching available slots');
    }
};

const bookAppointment = async (req, res) => {
    try {
        const { forUserId, doctorId, hospitalId, appointmentDate, appointmentTime, disease } = req.body;

        // forUserId defaults to the caller themself; when supplied, it must
        // be the caller or a family member they manage — never arbitrary.
        // This is the core security boundary of patient self-service booking.
        const ownedIds = await getOwnedUserIds(req);
        const targetUserId = forUserId ? String(forUserId) : String(req.auth.id);
        if (!ownedIds.includes(targetUserId)) {
            return errorResponse(res, 'You can only book for yourself or a family member you manage');
        }

        const targetUser = await userModel.findOne({ _id: targetUserId, delete: false });
        if (!targetUser) {
            return errorResponse(res, 'Patient not found');
        }

        // Family members often share the account holder's phone rather
        // than having their own — fall back to the caller's own number so
        // WhatsApp notifications still have somewhere to go.
        let mobilenumber = targetUser.mobileNumber;
        if (!mobilenumber) {
            const caller = await userModel.findById(req.auth.id);
            mobilenumber = caller?.mobileNumber;
        }

        const result = await createAppointmentRecord({
            hospitalId, doctorId, userId: targetUser._id,
            fullName: targetUser.fullName, mobilenumber,
            disease, appointmentDate, appointmentTime,
            isEmergency: false, // never accepted from the patient app
            actorRole: 'user',
        });

        if (!result.success) {
            return errorResponse(res, result.message);
        }

        return successResponse(res, 'Appointment booked successfully', {
            appointmentId: result.appointment._id,
            appointmentDate: result.appointmentDetail.appointmentDate,
            appointmentTime: result.appointmentDetail.appointmentTime,
        });
    } catch (error) {
        console.error('Error booking appointment:', error);
        return errorResponse(res, 'Error booking appointment');
    }
};

module.exports = { getAvailableSlots, bookAppointment };
