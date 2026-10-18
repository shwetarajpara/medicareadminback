// /models/parameterModel.js
const mongoose = require('mongoose');

const parameterSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['NUMERIC', 'POS_NEG', 'TEXT'],
        required: true
    },
    unit: {
        type: String,
        default: null,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    delete: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt'
    }
});

// Add index for faster lookups
parameterSchema.index({ code: 1 }, { unique: true });
parameterSchema.index({ category: 1 });
parameterSchema.index({ isActive: 1 });

const Parameter = mongoose.model('Parameter', parameterSchema);

module.exports = Parameter;

// {
//   "code": "HB",
//   "name": "Hemoglobin",
//   "category": "CBC",
//   "type": "NUMERIC",
//   "unit": "g/dL",
//   "isActive": true
// }
