const moment = require("moment");
const appointmentdetailModel = require("../model/appointmentdetail");
const { sendWhatsAppMessages } = require("./whatsappService");
const appointmentModel = require("../model/appointment");
const doctorModel = require("../model/doctor");
const userModel = require("../model/user");
const mongoose = require("mongoose");
const { saveModel } = require("./index");
const { getDoctorSlots, resolveBookableSlot } = require("./availability");

async function shiftAppointments(doctorId, appointmentDate, startTime, endTime, avgSlotDuration = 30) {
    // 1. Fetch all non-deleted appointments for that doctor & date
    let appointments = await appointmentdetailModel.find({
        doctorId,
        appointmentDate,
        startTime,
        endTime,
        delete: false
    }).sort({ appointmentTime: 1 });

    if (!appointments.length) return;

    // 2. Convert times to minutes since midnight for easier calculations
    const parseTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    let currentTime = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    const slotDuration = Math.min(avgSlotDuration, endMinutes - currentTime); // Ensure we don't exceed the time range

    if (slotDuration <= 0) return; // Invalid time range

    // 3. Generate time slots considering the exact duration
    const slots = [];
    while (currentTime + slotDuration <= endMinutes) {
        const hours = Math.floor(currentTime / 60).toString().padStart(2, '0');
        const minutes = (currentTime % 60).toString().padStart(2, '0');
        slots.push(`${hours}:${minutes}`);
        currentTime += slotDuration;
    }

    if (slots.length === 0) return; // No valid slots found

    // 4. Sort appointments by original time
    appointments.sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime));

    // 5. Assign appointments to slots
    for (let i = 0; i < Math.min(slots.length, appointments.length); i++) {
        const slot = slots[i];
        const appt = appointments[i];

        // Update the appointment with the new time slot
        await appointmentdetailModel.findByIdAndUpdate(
            appt._id,
            {
                $set: {
                    appointmentTime: slot,
                    update: new Date()
                }
            }
        );

        const appointmentDetails = await getAppointmentDetails(appt.appointmentId);
        const bookingTimeForWhatsApp = formatBookingTime(appointmentDetails.appointmentDate, appointmentDetails.appointmentTime);
        const whatsappMessageData = {
            patientName: appointmentDetails.patient.fullName,
            doctorName: appointmentDetails.doctor.name,
            hospitalAddress: appointmentDetails.hospital.address + ", " + appointmentDetails.hospital.city + ", " + appointmentDetails.hospital.state + ", " + appointmentDetails.hospital.pincode,
            bookingTime: bookingTimeForWhatsApp
        }
        await sendWhatsAppMessages("shiftAppointment", [appt.mobileNumber], whatsappMessageData);
        console.log(`Updated appointment ${appt._id} to slot ${slot}`);
    }
}

function formatBookingTime(bookingDate, bookingTime) {
    // Convert date into "12-July" format
    const dateObj = new Date(bookingDate);
    const options = { day: '2-digit', month: 'long', year: 'numeric' }; // Example: 10 September 2025
    const formattedDate = dateObj.toLocaleDateString('en-GB', options);

    bookingTime = moment(bookingTime, "HH:mm").format("hh:mm A");

    // Final booking datetime string
    const bookingTimeForWhatsApp = `${formattedDate} at ${bookingTime}`;
    return bookingTimeForWhatsApp;
}

const getAppointmentDetails = async (appointmentId) => {
    try {
        const result = await appointmentModel.aggregate([
            // Match the appointment
            { $match: { _id: new mongoose.Types.ObjectId(appointmentId) } },

            // Lookup appointment details
            {
                $lookup: {
                    from: 'appointmentdetails',
                    localField: '_id',
                    foreignField: 'appointmentId',
                    as: 'appointmentDetails'
                }
            },
            { $unwind: '$appointmentDetails' },

            // Lookup user (patient) information
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'patient'
                }
            },
            { $unwind: '$patient' },

            // Lookup doctor information
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'doctorId',
                    foreignField: '_id',
                    as: 'doctor'
                }
            },
            { $unwind: '$doctor' },

            // Lookup hospital information
            {
                $lookup: {
                    from: 'hospitals',
                    localField: 'hospitalId',
                    foreignField: '_id',
                    as: 'hospital'
                }
            },
            { $unwind: '$hospital' },

            // Project only necessary fields
            {
                $project: {
                    _id: 1,
                    appointmentDate: '$appointmentDetails.appointmentDate',
                    appointmentTime: '$appointmentDetails.appointmentTime',
                    status: '$appointmentDetails.status',
                    isEmergency: '$appointmentDetails.isEmergency',
                    disease: '$appointmentDetails.disease',
                    chiefComplaints: '$appointmentDetails.chiefComplaints',
                    probableDiagnosis: '$appointmentDetails.probableDiagnosis',
                    doctorRemarks: '$appointmentDetails.doctorRemarks',

                    patient: {
                        _id: '$patient._id',
                        fullName: '$patient.fullName',
                        mobileNumber: '$patient.mobileNumber',
                        email: '$patient.email',
                        gender: '$patient.gender',
                        dob: '$patient.dob'
                    },

                    doctor: {
                        _id: '$doctor._id',
                        name: '$doctor.name',
                        specialization: '$doctor.specialization',
                        mobileNumber: '$doctor.mobileNumber',
                        email: '$doctor.email'
                    },

                    hospital: {
                        _id: '$hospital._id',
                        name: '$hospital.name',
                        address: '$hospital.address',
                        city: '$hospital.city',
                        state: '$hospital.state',
                        pincode: '$hospital.pincode',
                        mobileNumber: '$hospital.mobileNumber'
                    }
                }
            }
        ]);

        return result[0] || null;
    } catch (error) {
        console.error('Error fetching appointment details:', error);
        throw error;
    }
};

// Shared core of "book an appointment" — used by both the hospital-staff
// path (adminController.addAppointment) and the patient self-service path
// (userAppointmentController.bookAppointment), so capacity accounting,
// emergency rules, and record creation can never drift between the two.
// Returns { success:true, appointment, appointmentDetail } or
// { success:false, message } — never throws for expected validation
// failures (doctor not found, slot taken, etc.), only for real errors.
const createAppointmentRecord = async ({
    hospitalId, doctorId, userId, fullName, mobilenumber, disease = '',
    appointmentDate, appointmentTime, isEmergency = false, actorRole,
}) => {
    // Emergency bookings are a staff-only override — never reachable from a
    // patient's own token, regardless of which entry point is calling this.
    if (isEmergency && actorRole === 'user') {
        return { success: false, message: 'Emergency bookings can only be made by hospital staff' };
    }

    if (!fullName) return { success: false, message: 'Full name is required' };
    if (!mobilenumber) return { success: false, message: 'Mobile number is required' };
    if (!doctorId) return { success: false, message: 'Doctor is required' };
    if (!isEmergency) {
        if (!appointmentDate) return { success: false, message: 'Appointment date is required' };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
            return { success: false, message: 'Invalid date format. Please use YYYY-MM-DD.' };
        }
        if (!appointmentTime) return { success: false, message: 'Appointment time is required' };
    }

    const doctor = await doctorModel.findOne({ delete: false, _id: doctorId });
    if (!doctor) return { success: false, message: 'Doctor is Not Available' };

    let resolvedDate = appointmentDate;
    let resolvedTime = appointmentTime;

    if (isEmergency) {
        const now = moment();
        resolvedDate = now.format('YYYY-MM-DD');
        resolvedTime = now.format('HH:mm');
        const { dayStatus } = await getDoctorSlots(doctorId, resolvedDate);
        if (dayStatus === 'holiday' || dayStatus === 'closed') {
            return { success: false, message: 'Doctor is not available today — cannot book an emergency appointment' };
        }
    } else {
        const resolvedSlot = await resolveBookableSlot(doctorId, resolvedDate, resolvedTime);
        if (!resolvedSlot) return { success: false, message: 'Selected slot is no longer available' };
        resolvedTime = resolvedSlot.start;
    }

    let resolvedUserId = userId;
    if (!resolvedUserId) {
        const existing = await userModel.findOne({ mobileNumber: mobilenumber, delete: false });
        resolvedUserId = existing ? existing._id : (await saveModel(userModel, { fullName, mobileNumber: mobilenumber }))._id;
    }

    const appointment = await saveModel(appointmentModel, {
        userId: resolvedUserId,
        mobileNumber: mobilenumber,
        fullName,
        hospitalId,
        doctorId,
        departmentId: doctor.specializationId || undefined,
        create: new Date(),
    });
    if (!appointment) return { success: false, message: 'Error creating appointment' };

    const appointmentDetail = await saveModel(appointmentdetailModel, {
        create: new Date(),
        userId: resolvedUserId,
        doctorId,
        departmentId: doctor.specializationId || undefined,
        disease,
        duration: `${parseInt(doctor.averageAppointmentTime, 10) || 15}`,
        appointmentTime: resolvedTime,
        appointmentDate: resolvedDate,
        isEmergency,
        appointmentId: appointment._id,
    });

    return { success: true, appointment, appointmentDetail };
};

const DEFAULT_SHIFT = { start: '09:00', end: '17:00' };
const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Normalizes whatever shape the client sent for `workingHours` (from
// WorkingHoursEditor.jsx: per-day { isAvailable, shifts:[{start,end}] })
// into a complete 7-day object, filling in a sensible Mon-Fri 9-5 default
// for any day the client omitted. isAvailable:false or an empty shifts
// array both mean "closed all day" (see app/model/doctor.js).
const setDoctorWorkingHour = async (workingHours) => {
    const input = workingHours && typeof workingHours === 'object' ? workingHours : {};
    const result = {};

    DAYS_OF_WEEK.forEach((day) => {
        const dayInput = input[day];
        if (dayInput && Array.isArray(dayInput.shifts)) {
            const shifts = dayInput.shifts
                .filter((s) => s && s.start && s.end)
                .map((s) => ({ start: s.start, end: s.end }));
            result[day] = {
                isAvailable: dayInput.isAvailable !== undefined ? !!dayInput.isAvailable : shifts.length > 0,
                shifts,
            };
        } else {
            const isWeekday = day !== 'saturday' && day !== 'sunday';
            result[day] = { isAvailable: isWeekday, shifts: isWeekday ? [{ ...DEFAULT_SHIFT }] : [] };
        }
    });

    return result;
};


// Orders a doctor's queue for a given day and assigns each waiting entry a
// queueNumber + expectedStartTime, re-estimating the average consultation
// time from today's completed entries once there are enough to trust (same
// moment()-based time math as getSlotsDetails in adminController.js).
//
// entries: appointmentdetail docs (lean) for one doctor on one date, each with
//          { _id, status, priority, appointmentTime, checkedInAt, consultStartAt, consultEndAt }
// avgAppointmentTime: doctor.averageAppointmentTime (minutes), used until enough
//          completed consultations exist today to estimate a real average
const PRIORITY_RANK = { Emergency: 0, Priority: 1, Normal: 2 };

const computeQueueProjection = (entries, avgAppointmentTime, date) => {
    const completedToday = entries.filter(e => e.status === 'Completed' && e.consultStartAt && e.consultEndAt);

    let effectiveAvg = avgAppointmentTime || 30;
    if (completedToday.length >= 3) {
        const totalMinutes = completedToday.reduce((sum, e) => {
            return sum + moment(e.consultEndAt).diff(moment(e.consultStartAt), 'minutes');
        }, 0);
        effectiveAvg = Math.max(5, Math.round(totalMinutes / completedToday.length));
    }

    const inConsultation = entries.find(e => e.status === 'InConsultation');
    const waiting = entries
        .filter(e => ['Booked', 'Ongoing', 'CheckedIn'].includes(e.status))
        .sort((a, b) => {
            const rankDiff = PRIORITY_RANK[a.priority || 'Normal'] - PRIORITY_RANK[b.priority || 'Normal'];
            if (rankDiff !== 0) return rankDiff;
            const aTime = a.checkedInAt ? moment(a.checkedInAt) : moment(`${date} ${a.appointmentTime}`, 'YYYY-MM-DD HH:mm');
            const bTime = b.checkedInAt ? moment(b.checkedInAt) : moment(`${date} ${b.appointmentTime}`, 'YYYY-MM-DD HH:mm');
            return aTime.diff(bTime);
        });

    let cursor;
    if (inConsultation?.consultStartAt) {
        cursor = moment(inConsultation.consultStartAt).add(effectiveAvg, 'minutes');
    } else {
        cursor = moment();
    }

    const projected = waiting.map((entry, index) => {
        const expectedStartTime = cursor.clone();
        cursor = cursor.clone().add(effectiveAvg, 'minutes');
        return {
            ...entry,
            queueNumber: index + 1,
            expectedStartTime: expectedStartTime.format('HH:mm'),
        };
    });

    return { waiting: projected, inConsultation, effectiveAvg };
};

module.exports = { shiftAppointments, formatBookingTime, getAppointmentDetails, setDoctorWorkingHour, computeQueueProjection, createAppointmentRecord };
