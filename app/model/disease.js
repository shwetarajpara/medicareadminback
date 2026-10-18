// /models/disease.js
const mongoose = require('mongoose');

const diseaseSchema = new mongoose.Schema({
    disease: { type: String, required: true },
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const disease = mongoose.model('disease', diseaseSchema);

module.exports = disease;