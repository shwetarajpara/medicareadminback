// /models/content.js
const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
    
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: false },
    title: {type: String, enum: ['About', 'ContactInfo','Facility'], default: 'About'},
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const content = mongoose.model('content', contentSchema);

module.exports = content;
