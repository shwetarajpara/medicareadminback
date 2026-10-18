// /models/appointment.js
const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'doctor', required: false },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: false },
    // Derived server-side from the doctor's specializationId at write time —
    // never trust client input. null/undefined (pre-department-feature
    // records, or a doctor with no department) matches every department
    // filter, same wildcard convention as specialization.hospitalId.
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'specialization', required: false },

    fullName: { type: String, required: false, default: '' },
    mobileNumber: { type: String, required: false, default: '' },

    amount: { type: String, required: false },
    payableAmount: { type: String, required: false },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

// Hospital-scoped lists (appointments, patient pickers, medicine history).
appointmentSchema.index({ hospitalId: 1 });
appointmentSchema.index({ mobileNumber: 1 });

const appointment = mongoose.model('appointment', appointmentSchema);

module.exports = appointment;
