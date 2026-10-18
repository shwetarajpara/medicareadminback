// /models/ipd.js
const mongoose = require('mongoose');

const ipdSchema = new mongoose.Schema({
    // Original appointment references
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'appointment', required: true },
    appointmentDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'appointmentdetail', required: false },
    
    // Patient and doctor information
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    appointmentuserId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'doctor', required: false },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: false },
    // Derived server-side from the admitting doctor's specializationId.
    // null/undefined matches every department filter — see appointment.js.
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'specialization', required: false },

    // Patient basic info
    fullName: { type: String, required: false, default: '' },
    mobileNumber: { type: String, required: false, default: '' },
    
    appointmentDate: { type: Date, required: false },
    appointmentTime: { type: String, required: false },
    duration: { type: String, required: false },
    startTime: { type: String, required: false },
    endTime: { type: String, required: false },
    inTime: { type: String, required: false },
    outTime: { type: String, required: false },

    ipdAdmissionDate: { type: Date, default: Date.now },
    ipdDischargeDate: { type: Date, required: false },
    ipdStatus: { type: String, required: false, enum: ["Admitted", "Discharged", "Transferred"], default: "Admitted" },
    
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const ipd = mongoose.model('ipd', ipdSchema);

module.exports = ipd;
