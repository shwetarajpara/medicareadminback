// /models/document.js
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'document', required: false },
    images: { type: String, required: true },
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const document = mongoose.model('document', documentSchema);

module.exports = document;