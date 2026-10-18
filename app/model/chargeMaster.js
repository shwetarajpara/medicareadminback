const mongoose = require('mongoose');

const chargeMasterSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: true },
    name: { type: String, required: true },
    category: {
        type: String,
        enum: ["Consultation", "Procedure", "Lab", "Room", "Pharmacy", "Other"],
        default: "Other"
    },
    amount: { type: Number, required: true },
    isActive: { type: Boolean, default: true },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const chargeMaster = mongoose.model('chargeMaster', chargeMasterSchema);

module.exports = chargeMaster;
