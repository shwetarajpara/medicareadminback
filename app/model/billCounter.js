// /models/billCounter.js
//
// Backs the "001 = first bill issued today" segment of bill numbers —
// identical shape and atomicity rationale as certificateCounter.js, kept as
// its own collection so bill and certificate sequences never interfere.
const mongoose = require('mongoose');

const billCounterSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: true },
    dateKey: { type: String, required: true }, // YYYYMMDD
    seq: { type: Number, default: 0 },
});

billCounterSchema.index({ hospitalId: 1, dateKey: 1 }, { unique: true });

const billCounter = mongoose.model('billCounter', billCounterSchema);

module.exports = billCounter;
