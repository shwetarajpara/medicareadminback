// /models/certificateTemplate.js
//
// Admin-authored certificate templates. The uploaded .docx itself (docxUrl)
// is the template — not an HTML re-rendering of it — so margins,
// headers/footers, fonts and spacing are whatever the admin's Word document
// says, untouched. {{variableName}} tags inside it are mail-merge fields,
// same mental model as a WhatsApp/SMS template. `variables` is auto-derived
// from the docx's text on every upload (see certificateController.js); it's
// not hand-authored, just a cached list so the frontend knows which fields
// to show without re-parsing the file.
const mongoose = require('mongoose');

const certificateTemplateSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: true },
    name: { type: String, required: true },
    docxUrl: { type: String, required: true }, // Cloudinary raw-resource URL of the original .docx
    docxPublicId: { type: String, required: false }, // for replacing/deleting the stored file later
    variables: { type: [String], default: [] }, // auto-extracted {{tokens}}, in first-seen order

    delete: { type: Boolean, default: false },
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
});

const certificateTemplate = mongoose.model('certificateTemplate', certificateTemplateSchema);

module.exports = certificateTemplate;
