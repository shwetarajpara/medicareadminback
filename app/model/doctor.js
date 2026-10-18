const mongoose = require('mongoose');

// A day is a list of independent shifts (e.g. 09:00-13:00 and 15:00-17:00)
// rather than one start/end window with carved-out breaks — maps directly
// onto how a doctor actually describes their day. isAvailable:false or an
// empty shifts array both mean "closed all day."
const shiftSchema = new mongoose.Schema({
    start: { type: String, required: true }, // e.g. "09:00"
    end: { type: String, required: true },   // e.g. "13:00"
}, { _id: false });

const workingHourSchema = new mongoose.Schema({
    isAvailable: { type: Boolean, default: true },
    shifts: { type: [shiftSchema], default: [] },
}, { _id: false }); // don?t create _id for subdocs

const doctorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: false },
    mobileNumber: { type: String, required: false },
    specializationId: { type: mongoose.Schema.Types.ObjectId, ref: 'specialization', required: false },
    degree: { type: String, required: false },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: false },
    address: { type: String, required: false },

    appointmentCharge: { type: String, required: false },
    averageAppointmentTime: { type: Number, required: false },

    experience: { type: String, required: false },
    profile: { type: String, required: false },

    age: { type: String, required: true },
    gender: { type: String, required: true },

    workingHours: {
        monday: { type: workingHourSchema, default: {} },
        tuesday: { type: workingHourSchema, default: {} },
        wednesday: { type: workingHourSchema, default: {} },
        thursday: { type: workingHourSchema, default: {} },
        friday: { type: workingHourSchema, default: {} },
        saturday: { type: workingHourSchema, default: {} },
        sunday: { type: workingHourSchema, default: {} },
    },
    
    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
});

const doctor = mongoose.model('doctor', doctorSchema);

module.exports = doctor;
