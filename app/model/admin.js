// /models/admin.js
const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobileNumber: { type: String, required: false },
    gender: { type: String, enum: ["MALE", "FEMALE", "OTHER"], required: false },
    address: { type: String, required: false },
    stateId: { type: mongoose.Schema.Types.ObjectId, ref: 'state', required: false },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'city', required: false },
    zipCode: { type: String, required: false },
    profile: { type: String, required: false },
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const admin = mongoose.model('admin', adminSchema);

module.exports = admin; 