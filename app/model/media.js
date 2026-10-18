// /models/media.js
const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
    type: { type: String, default:null },
    typeId: { type: String, default:null },
    image: { type: String, default:null },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const media = mongoose.model('media', mediaSchema);

module.exports = media;