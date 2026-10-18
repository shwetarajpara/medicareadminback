// /models/appointmentuser.js
const mongoose = require('mongoose');

const appointmentuserSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    name: { type: String, required: true },
    email: { type: String, required: false },
    mobileNumber: { type: String, required: true },
    age: { type: String, required: true },
    gender: { type: String, required: true },
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const appointmentuser = mongoose.model('appointmentuser', appointmentuserSchema);

module.exports = appointmentuser;
