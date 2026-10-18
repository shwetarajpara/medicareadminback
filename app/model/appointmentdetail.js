// /models/appointmentdetail.js
const mongoose = require('mongoose');

const appointmentdetailSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    appointmentuserId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'appointment', required: false },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'doctor', required: false },
    // diseaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'disease', required: false },
    // Derived server-side from the doctor's specializationId at write time.
    // Duplicated here (not just on `appointment`) because this is the
    // collection queue/list reads actually query. null/undefined matches
    // every department filter — see appointment.js for the same convention.
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'specialization', required: false },

    chiefComplaints: { type: String, required: false, default: "" },
    probableDiagnosis: { type: String, required: false, default: "" },
    prescriptionList: { type: String, required: false, default: "" },
    labInvestigations: { type: String, required: false, default: "" },
    labReports: { type: String, required: false, default: "" },
    doctorRemarks: { type: String, required: false, default: "" },
    // Same structured consultation fields the IPD round form uses (see
    // model/ipdDetails.js). prescriptionList is still written as a plain-text
    // summary of `prescriptions` for older readers (patient app history).
    labReportNotes: { type: String, required: false, default: "" },
    advice: { type: String, required: false, default: "" },
    prescriptions: [{
        _id: false,
        medicineName: { type: String, default: "" },
        timing: { type: [String], default: [] },
        mealInstruction: { type: String, default: "" },
        days: { type: String, default: "" },
    }],
    nextAppointmentDate: { type: Date, required: false, default: "" },
    // "Ongoing" is the legacy default (pre-queue) and is treated as "Booked"
    // wherever queue logic reads status — see helper/appointmentHelper.js.
    status: {
        type: String,
        required: false,
        enum: ["Ongoing", "Booked", "CheckedIn", "InConsultation", "Completed", "NoShow", "Cancelled"],
        default: "Booked"
    },

    duration: { type: String, required: false },
    appointmentDate: { type: Date, required: false },
    appointmentTime: { type: String, required: false },
    startTime: { type: String, required: false },
    endTime: { type: String, required: false },
    inTime: { type: String, required: false },
    outTime: { type: String, required: false },

    // Queue management fields
    priority: { type: String, enum: ["Normal", "Priority", "Emergency"], default: "Normal" },
    queueNumber: { type: Number, required: false },
    checkedInAt: { type: Date, required: false },
    consultStartAt: { type: Date, required: false },
    consultEndAt: { type: Date, required: false },
    queueNote: { type: String, required: false },

    // ABDM care-context linking (M2, lightweight — metadata only, no clinical
    // data transmitted). Set once this consultation has been registered
    // against the patient's ABHA.
    careContextLinkedAt: { type: Date, required: false },

    disease: { type: String, required: false },
    isEmergency: { type: Boolean, default: false },

    amount: { type: String, required: false },
    payableAmount: { type: String, required: false },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

// Every appointment list joins details by appointmentId and filters by
// date — without these, each one is a full collection scan.
appointmentdetailSchema.index({ appointmentId: 1 });
appointmentdetailSchema.index({ appointmentDate: 1 });

const appointmentdetail = mongoose.model('appointmentdetail', appointmentdetailSchema);

module.exports = appointmentdetail;
