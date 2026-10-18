const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: false },
    caseId: { type: String, required: true },

    name: { type: String, required: false },
    gender: { type: String, required: false },
    dateOfBirth: { type: String, required: false },
    age: { type: String, required: false },
    referredBy: { type: String, required: false },
    doctorNumber: { type: String, required: false },
    address: { type: String, required: false },
    mobile: { type: String, required: false },

    tests: [{ type: String }],
    cbcValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    results: { type: mongoose.Schema.Types.Mixed, default: {} },

    status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
    registeredTime: { type: String, required: false },
    reportAddedTime: { type: String, required: false, default: null },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
}, { minimize: false }); // keep empty cbcValues/results as {} instead of stripping them

const report = mongoose.model('report', reportSchema);

module.exports = report;
