const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'appointment', required: false },
    appointmentDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'appointmentdetail', required: false },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'doctor', required: false },

    patientName: { type: String, required: true },
    patientMobile: { type: String, required: false },

    // templateType is the old hardcoded-template identifier (e.g.
    // "MedicalCertificate") — kept, not required, for records created before
    // the admin-authored template system. New records use templateId +
    // templateName (a name snapshot, so the list still reads sensibly even
    // if the template is later renamed or deleted).
    templateType: { type: String, required: false },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'certificateTemplate', required: false },
    templateName: { type: String, required: false },
    certificateNumber: { type: String, required: true },
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
    content: { type: String, required: false }, // rendered snapshot, stable even if the template later changes
    fileUrl: { type: String, required: false }, // Cloudinary URL once the PDF is uploaded

    // A manually-edited .docx for THIS certificate, downloaded from the
    // template+fields fill then re-uploaded after editing in Word — lets an
    // admin tweak wording beyond the declared {{variables}} without losing
    // true-fidelity rendering (the PDF still comes from LibreOffice
    // converting a real Word file, just one the admin finished editing).
    // When set, Preview/Issue render THIS file directly instead of
    // re-filling the template, and the `fields` form becomes informational
    // until the override is discarded.
    overrideDocxUrl: { type: String, required: false },
    overrideDocxPublicId: { type: String, required: false },

    status: { type: String, enum: ["Draft", "Issued"], default: "Draft" },
    issuedAt: { type: Date, required: false },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
}, { minimize: false });

const certificate = mongoose.model('certificate', certificateSchema);

module.exports = certificate;
