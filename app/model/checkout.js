// /models/doctor.js
const mongoose = require('mongoose');

const checkoutSchema = new mongoose.Schema({

    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'doctor', required: false },
    startTime: { type:Date, required: false },
    endTime: { type: Date, required: false },
    reason: { type: String, required: false,default:null },
    create: { type: Date, default: Date.now }
});

const checkout = mongoose.model('checkout', checkoutSchema);

module.exports = checkout;
