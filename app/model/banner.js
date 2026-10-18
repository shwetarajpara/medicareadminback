// /models/banner.js
const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
    
    title: { type: String, required: false, default: '' },
    image: { type: String, required: false, default: '' },
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const banner = mongoose.model('banner', bannerSchema);

module.exports = banner;
