// /models/appointmentdetail.js
const mongoose = require('mongoose');

const appointmentdetailSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    appointmentuserId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'appointment', required: false },
    // diseaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'disease', required: false },

    chiefComplaints: { type: String, required: false, default: "" },
    probableDiagnosis: { type: String, required: false, default: "" },
    prescriptionList: { type: String, required: false, default: "" },
    labInvestigations: { type: String, required: false, default: "" },
    labReports: { type: String, required: false, default: "" },
    doctorRemarks: { type: String, required: false, default: "" },
    nextAppointmentDate: { type: Date, required: false, default: "" },
    status: { type: String, required: false, enum: ["Ongoing", "Completed"], default: "Ongoing" },

    duration: { type: String, required: false },
    appointmentDate: { type: Date, required: false },
    appointmentTime: { type: String, required: false },
    inTime: { type: String, required: false },
    outTime: { type: String, required: false },

    disease: { type: String, required: false },
    isEmergency: { type: Boolean, default: false },

    amount: { type: String, required: false },
    payableAmount: { type: String, required: false },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const appointmentdetail = mongoose.model('appointmentdetail', appointmentdetailSchema);

module.exports = appointmentdetail;
