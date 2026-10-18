// /models/hospital.js
const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({

    ownerName: { type: String, required: true },
    socialMediaLinks: { type: String, required: false },
    name: { type: String, required: false },
    email: { type: String, required: false },
    password: { type: String, required: false },
    mobileNumber: { type: String, required: false },
    type: { type: String, enum: ['Multispeciality', 'Speciality', 'Other'], required: false },

    address: { type: String, required: false },
    city: { type: String, required: false },
    state: { type: String, required: false },
    pincode: { type: String, required: false },

    latitude: { type: String, required: false },
    longitude: { type: String, required: false },

    // Short unique code assigned at onboarding (see helper/hospitalCode.js),
    // used as the hospital segment of certificate numbers:
    // CRT<certCode><YYYYMMDD><seq>. Hospitals onboarded before this existed
    // get one lazily generated the first time they issue a certificate.
    certCode: { type: String, required: false, uppercase: true, unique: true, sparse: true },
    profile: { type: String, default: null },
    content: { type: [Object], default: [] },
    specialization: [{ type: String }],  // Array of strings
    otherSpecialization: { type: String, required: false },

    // ABDM/ABHA integration — opt-in per hospital via Settings. clientSecret is
    // intentionally NOT stored here; it lives server-side only (see
    // app/helper/abdmClient.js) to avoid ever returning it in an API response.
    abdm: {
        enabled: { type: Boolean, default: false },
        clientId: { type: String, required: false },
        hfrId: { type: String, required: false },
        environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
    },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const hospital = mongoose.model('hospital', hospitalSchema);

module.exports = hospital;