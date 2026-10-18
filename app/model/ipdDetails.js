// /models/ipd.js
const mongoose = require('mongoose');

const ipdDetailsSchema = new mongoose.Schema({
    
    ipdId: { type: mongoose.Schema.Types.ObjectId, ref: 'ipds', required: true },
    instructions: { type: String, required: false },
    // Was ref: 'doctors' (no such registered model — silently broke any
    // .populate('doctorId') ever attempted on this collection). Fixed to
    // match the actual registered model name (see app/model/doctor.js).
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'doctor', required: false},
    instructionDate: { type: Date, required: false },

    // Lab report & prescription round entry (IPD "Add Instruction" form).
    // These were sent by the admin UI before but had no schema fields, so
    // Mongoose silently dropped them.
    labReport: { type: String, required: false, default: "" },
    labReportFile: { type: String, required: false, default: "" },
    complaints: { type: String, required: false, default: "" },
    labInvestigations: { type: String, required: false, default: "" },
    advice: { type: String, required: false, default: "" },
    remarks: { type: String, required: false, default: "" },
    prescriptions: [{
        _id: false,
        medicineName: { type: String, default: "" },
        timing: { type: [String], default: [] },
        mealInstruction: { type: String, default: "" },
        days: { type: String, default: "" },
    }],

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const ipdDetails = mongoose.model('ipdDetails', ipdDetailsSchema);

module.exports = ipdDetails;
