// Date-specific override on top of a doctor's recurring weekly workingHours
// (see app/model/doctor.js) — a full-day holiday, or altered hours just for
// that one date (e.g. a half-day). One entry per doctor per calendar day.
const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
    start: { type: String, required: true },
    end: { type: String, required: true },
}, { _id: false });

const doctorLeaveSchema = new mongoose.Schema({
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'doctor', required: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: false },
    date: { type: Date, required: true },
    // 'full' = closed all day regardless of the normal weekly pattern.
    // 'custom' = this date's shifts are fully replaced by the `shifts` below
    // (e.g. a half-day) rather than being closed outright.
    type: { type: String, enum: ['full', 'custom'], required: true, default: 'full' },
    shifts: { type: [shiftSchema], default: [] }, // only meaningful when type:'custom'
    reason: { type: String, required: false, default: '' },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

doctorLeaveSchema.index({ doctorId: 1, date: 1 }, { unique: true });

const doctorLeave = mongoose.model('doctorLeave', doctorLeaveSchema);

module.exports = doctorLeave;
