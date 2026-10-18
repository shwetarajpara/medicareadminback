// /models/appointmentuser.js
const mongoose = require('mongoose');

// general medicine,
// psychiatrist,
// gynaecologist,
// dentist,
// paediatrics,
// general surgeon

const specializationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: false },
    // null/undefined = a global specialization visible to every hospital;
    // set = a hospital's own department, visible only to that hospital.
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: false },
    headDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'doctor', required: false },
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const specialization = mongoose.model('specialization', specializationSchema);

module.exports = specialization;
