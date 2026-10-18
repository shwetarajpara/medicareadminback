// /models/doctor.js
const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({

    name: { type: String, required: true },
    email: { type: String, required: false },
    mobileNumber: { type: String, required: false },
    specializationId: { type: String, required: false },
    degreeId: { type: String, required: false },
    hospitalId: { type: String, required: false },
    address: { type: String, required: false },

    appointmentCharge: { type: String, required: false },

    experience: { type: String, required: false },
    profile: { type: String, required: false },

    age: { type: String, required: true },
    gender: { type: String, required: true },
    
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
});

const doctor = mongoose.model('doctor', doctorSchema);

module.exports = doctor;
