// CommonJS like every other model — this file used to be an ES module
// (`export default`), which only loads through require() on Node 22.12+.
const mongoose = require("mongoose");
const { Schema } = mongoose;


// Schema definition
const OtpVerificationSchema = new Schema(
    {
        mobileNumber: { type: String, required: true, unique : true },
        otp: { type: String, required: true },
        expiresAt: {
            type: Date,
            required: true,
            default: () => new Date(Date.now() + 10 * 60 * 1000), // +10 min
        },
        attempts: { type: Number, default: 0 },
        isVerified: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);
const OtpVerification = mongoose.model("otpVerification", OtpVerificationSchema);

module.exports = OtpVerification;
