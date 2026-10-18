// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//     fullName: { type: String, required: false },
//     // in your user schema
//     email: { type: String, unique: true, sparse: true , default: null},
//     password: { type: String, required: false },
//     mobileNumber: { type: String, required: false },
//     dob: { type: Date, required: false },
//     gender: { type: String, enum: ["MALE", "FEMALE", "OTHER"], required: false, default: "MALE" },
//     address: { type: String, required: false },
//     stateId: { type: String, required: false },
//     cityId: { type: String, required: false },
//     // stateId: { type: mongoose.Schema.Types.ObjectId, ref: 'state', required: false },
//     // cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'city', required: false },
//     zipCode: { type: String, required: false },
//     profile: { type: String, required: false, default: "" },
//     loginOS: { type: String, required: false },
//     loginAppVersion: { type: String, required: false },
//     loginDevice: { type: String, required: false },
//     registerAppVersion: { type: String, required: false },
//     registerOS: { type: String, required: false },
//     registerDevice: { type: String, required: false },
//     create: { type: Date, default: Date.now },
//     update: { type: Date, default: Date.now },
//     delete: { type: Boolean, default: false },
// });

// const user = mongoose.model('user', userSchema);

// module.exports = user;


const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: false },
    password: { type: String, required: false },
    // One mobile number = one login-capable account. sparse so family
    // members (who usually share the primary account holder's phone
    // rather than having their own) can leave this blank without colliding
    // with each other — only genuine duplicate numbers get rejected.
    mobileNumber: { type: String, required: false, unique: true, sparse: true },
    dob: { type: Date, required: false },
    gender: { type: String, enum: ["MALE", "FEMALE", "OTHER"], required: false, default: "MALE" },
    address: { type: String, required: false },
    stateId: { type: String, required: false },
    cityId: { type: String, required: false },
    zipCode: { type: String, required: false },
    profile: { type: String, required: false, default: "" },
    loginOS: { type: String, required: false },
    loginAppVersion: { type: String, required: false },
    loginDevice: { type: String, required: false },
    registerAppVersion: { type: String, required: false },
    registerOS: { type: String, required: false },
    registerDevice: { type: String, required: false },

    // ABDM/ABHA (M1) — set once the patient links/creates their health ID.
    abhaNumber: { type: String, required: false },   // 14-digit ABHA number
    abhaAddress: { type: String, required: false },  // e.g. "patient@abdm"
    abhaVerifiedAt: { type: Date, required: false },

    // Family members: ordinary user documents managed under a primary,
    // login-capable account rather than having their own login — this way
    // every existing userId-keyed system (appointments, bills, certificates,
    // IPD) already works for them with no changes to those models.
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    relation: { type: String, enum: ['Self', 'Spouse', 'Child', 'Parent', 'Sibling', 'Other'], required: false },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
});

const user = mongoose.model('user', userSchema);

module.exports = user;
