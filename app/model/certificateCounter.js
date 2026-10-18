// /models/certificateCounter.js
//
// Backs the "001 = first certificate issued today" segment of certificate
// numbers. One document per (hospital, day); findOneAndUpdate with $inc is
// atomic in MongoDB, so concurrent "issue certificate" requests from the
// same hospital on the same day can never be handed the same sequence
// number — a plain count-then-use-N+1 query would race under concurrency.
const mongoose = require('mongoose');

const certificateCounterSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: true },
    dateKey: { type: String, required: true }, // YYYYMMDD
    seq: { type: Number, default: 0 },
});

certificateCounterSchema.index({ hospitalId: 1, dateKey: 1 }, { unique: true });

const certificateCounter = mongoose.model('certificateCounter', certificateCounterSchema);

module.exports = certificateCounter;
