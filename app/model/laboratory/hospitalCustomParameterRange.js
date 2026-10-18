const mongoose = require('mongoose');

const hospitalCustomParameterRange = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    parameterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Parameter',
        required: true
    },
    gender: {
        type: String,
        enum: ['MALE', 'FEMALE', 'BOTH'],
        required: true
    },
    ageFrom: {
        type: Number,  // in years
        required: true,
        min: 0
    },
    ageTo: {
        type: Number,  // in years
        default: null, // null means 18+
        min: 0
    },
    minValue: {
        type: Number,
        required: true
    },
    maxValue: {
        type: Number,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    delete: {
        type: Boolean,
        default : false
    }
}, {
    timestamps: {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt'
    }
});

// Add indexes for faster lookups
hospitalCustomParameterRange.index({ hospitalId: 1 });
hospitalCustomParameterRange.index({ parameterId: 1 });
hospitalCustomParameterRange.index({ gender: 1 });
hospitalCustomParameterRange.index({ isActive: 1 });

// Add a compound index for unique constraint
hospitalCustomParameterRange.index(
    { hospitalId: 1, parameterId: 1, gender: 1, ageFrom: 1, ageTo: 1 },
    { unique: true }
);

// Add a pre-save hook to validate that ageTo is greater than ageFrom when not null
hospitalCustomParameterRange.pre('save', function (next) {
    if (this.ageTo !== null && this.ageTo <= this.ageFrom) {
        throw new Error('ageTo must be greater than ageFrom');
    }
    next();
});

const HospitalReferenceRange = mongoose.model('HospitalReferenceRange', hospitalCustomParameterRange);

module.exports = HospitalReferenceRange;

// Example usage:
// {
//   "hospitalId": "5f8d0d55b54764421b6b0b1a",
//   "parameterId": "5f8d0d55b54764421b6b0b1c",
//   "gender": "FEMALE",
//   "ageFrom": 0,
//   "ageTo": 12,
//   "minValue": 11.5,
//   "maxValue": 15.5,
//   "isActive": true
// }