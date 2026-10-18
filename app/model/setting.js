// /models/setting.js
const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({

    key: { type: String, required: true },
    value: { type: String, required: true },
    
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const setting = mongoose.model('setting', settingSchema);

module.exports = setting;