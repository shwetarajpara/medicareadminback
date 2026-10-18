// Single source of truth for "what slots does this doctor have on this
// date, and which are still bookable." Used by getSlotsDetails (listing),
// addAppointment/addAppointmentV2 (booking validation), and
// getMonthAvailability (the red/available calendar) — previously each of
// these had its own separate, inconsistent slot logic.
const moment = require('moment');
const doctorModel = require('../model/doctor');
const doctorLeaveModel = require('../model/doctorLeave');
const appointmentdetailModel = require('../model/appointmentdetail');

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// `appointmentDate`/`doctorLeave.date` are stored by passing a plain
// 'YYYY-MM-DD' string straight to Mongoose, which casts it via the native
// `new Date(str)` — parsed as UTC midnight per the ECMA-262 date-only-string
// rule. moment(dateStr).startOf('day').toDate() instead produces *local*
// midnight, which on a server not running in UTC (this one runs in IST,
// UTC+5:30) is a different instant entirely — an exact-match query built
// that way silently matches nothing. Always use this for exact-day
// equality against those fields, never moment's local-midnight.
const toDateOnly = (dateStr) => new Date(dateStr);

// A doctorLeave entry for the exact date wins over the recurring weekly
// workingHours pattern. type:'full' => no shifts at all (closed);
// type:'custom' => that date's shifts are fully replaced (e.g. half-day).
const getEffectiveShifts = async (doctor, dateStr) => {
    const leave = await doctorLeaveModel.findOne({
        doctorId: doctor._id,
        date: toDateOnly(dateStr),
        delete: false,
    });

    if (leave) {
        if (leave.type === 'full') {
            return { shifts: [], isHoliday: true, leaveReason: leave.reason };
        }
        return { shifts: leave.shifts || [], isHoliday: false, leaveReason: leave.reason };
    }

    const dayName = DAYS_OF_WEEK[moment(dateStr).day()];
    const dayConfig = doctor.workingHours?.[dayName];
    if (!dayConfig || !dayConfig.isAvailable) {
        return { shifts: [], isHoliday: false };
    }
    return { shifts: dayConfig.shifts || [], isHoliday: false };
};

// Returns { slots: [{start,end,available}], dayStatus } for one doctor on
// one date (dateStr: 'YYYY-MM-DD'). dayStatus is 'open' (at least one free
// slot), 'fully_booked' (shifts exist but every slot is taken), 'holiday'
// (a full-day leave override), or 'closed' (not scheduled to work that day
// at all under the normal weekly pattern).
const getDoctorSlots = async (doctorId, dateStr) => {
    const doctor = await doctorModel.findById(doctorId);
    if (!doctor) return { slots: [], dayStatus: 'closed' };

    const slotSize = parseInt(doctor.averageAppointmentTime, 10) || 15;
    const { shifts, isHoliday } = await getEffectiveShifts(doctor, dateStr);

    if (!shifts.length) {
        return { slots: [], dayStatus: isHoliday ? 'holiday' : 'closed' };
    }

    // Cancelled appointments are deliberately excluded here — that's what
    // actually frees a slot back up (see cancelAppointment / the holiday
    // cascade-cancellation in doctorLeaveController.js).
    const booked = await appointmentdetailModel.find({
        doctorId,
        appointmentDate: toDateOnly(dateStr),
        delete: false,
        status: { $ne: 'Cancelled' },
    });
    const bookedRanges = booked.map((b) => {
        const start = moment(`${dateStr} ${b.appointmentTime}`, 'YYYY-MM-DD HH:mm');
        const durationMinutes = parseInt(b.duration, 10) || slotSize;
        return { start, end: start.clone().add(durationMinutes, 'minutes') };
    });

    const now = moment();
    const isToday = moment(dateStr, 'YYYY-MM-DD').isSame(now, 'day');

    const slots = [];
    for (const shift of shifts) {
        let cursor = moment(`${dateStr} ${shift.start}`, 'YYYY-MM-DD HH:mm');
        const shiftEnd = moment(`${dateStr} ${shift.end}`, 'YYYY-MM-DD HH:mm');

        while (cursor.isBefore(shiftEnd)) {
            const start = cursor.clone();
            const candidateEnd = cursor.clone().add(slotSize, 'minutes');
            const end = candidateEnd.isAfter(shiftEnd) ? shiftEnd : candidateEnd;

            // Drop slots that have already started — "currently 6-23, even
            // an empty 5-6pm slot should never be shown" for today.
            if (!(isToday && start.isBefore(now))) {
                const overlap = bookedRanges.some((b) => start.isBefore(b.end) && end.isAfter(b.start));
                slots.push({ start: start.format('HH:mm'), end: end.format('HH:mm'), available: !overlap });
            }

            cursor = cursor.add(slotSize, 'minutes');
        }
    }

    const anyAvailable = slots.some((s) => s.available);
    return { slots, dayStatus: isHoliday ? 'holiday' : (anyAvailable ? 'open' : 'fully_booked') };
};

// Buckets getDoctorSlots's fine-grained (averageAppointmentTime-sized) slots
// into clock hours for the booking UI — staff pick "8-9 PM", not individual
// 10-minute slots; the fine slots still do all the actual capacity
// accounting underneath (see resolveBookableSlot). An hour with zero fine
// slots at all (fully past, or fully outside any shift) is dropped
// entirely; an hour with at least one slot is included either way so a
// fully-booked-but-upcoming hour still shows (as unavailable) rather than
// silently vanishing.
const getHourlyAvailability = async (doctorId, dateStr) => {
    const { slots, dayStatus } = await getDoctorSlots(doctorId, dateStr);

    const buckets = new Map(); // hourStart ('HH:00') -> { start, end, available }
    for (const slot of slots) {
        const hourStart = `${slot.start.slice(0, 2)}:00`;
        const hourEnd = moment(`${dateStr} ${hourStart}`, 'YYYY-MM-DD HH:mm').add(1, 'hour').format('HH:mm');
        const existing = buckets.get(hourStart);
        if (existing) {
            existing.available = existing.available || slot.available;
        } else {
            buckets.set(hourStart, { start: hourStart, end: hourEnd, available: slot.available });
        }
    }

    const hours = Array.from(buckets.values()).sort((a, b) => a.start.localeCompare(b.start));
    return { hours, dayStatus };
};

// Resolves a staff-chosen hour block ("20:00") to the actual bookable
// fine-grained slot inside it — first-fit among whatever getDoctorSlots
// currently considers available. Returns null if the hour has filled up
// between the dropdown being loaded and the booking being submitted.
const resolveBookableSlot = async (doctorId, dateStr, hourStart) => {
    const { slots } = await getDoctorSlots(doctorId, dateStr);
    const hourStartMoment = moment(`${dateStr} ${hourStart}`, 'YYYY-MM-DD HH:mm');
    const hourEndMoment = hourStartMoment.clone().add(1, 'hour');

    const candidate = slots.find((s) => {
        if (!s.available) return false;
        const slotStart = moment(`${dateStr} ${s.start}`, 'YYYY-MM-DD HH:mm');
        return slotStart.isSameOrAfter(hourStartMoment) && slotStart.isBefore(hourEndMoment);
    });

    return candidate || null;
};

module.exports = {
    getDoctorSlots,
    getEffectiveShifts,
    getHourlyAvailability,
    resolveBookableSlot,
    DAYS_OF_WEEK,
    toDateOnly,
};
