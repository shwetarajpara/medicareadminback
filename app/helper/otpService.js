const axios = require("axios");
const OtpVerification = require("../model/otpVerification");
require("dotenv").config();

const SHREESMS_URL = "https://web.shreesms.net/API/SendSMS.aspx";
const SHREESMS_API_KEY = process.env.SHREESMS_API_KEY;
const SHREESMS_SENDER_ID = process.env.SHREESMS_SENDER_ID;  // QUEUELES
const SHREESMS_ENTITY_ID = process.env.SHREESMS_ENTITY_ID;  // 1701175817292947842
const SHREESMS_TEMPLATE_ID = process.env.SHREESMS_TEMPLATE_ID; // 1707175860554916635
const otpExpiryMinutes = process.env.OTP_EXPIRY_MINUTES || 10;

// Generate a random numeric OTP
function generateOTP(length = 6) {
    let otp = "";
    for (let i = 0; i < length; i++) {
        otp += Math.floor(Math.random() * 10);
    }
    return otp;
}

async function sendOTP(mobileNumber) {
    const otp = generateOTP();

    // 🚨 MUST match template exactly with {#var#} replaced
    const message = `Login OTP is ${otp} for Queueless. This will be valid only for 10 min. Please Don't share with anyone -Team Queueless`;
    const url = `${SHREESMS_URL}` +
        `?APIkey=${SHREESMS_API_KEY}` +
        `&SenderID=${SHREESMS_SENDER_ID}` +
        `&SMSType=OTPTransaction` + // Service Implicit
        `&Mobile=${mobileNumber}` +
        `&MsgText=${encodeURIComponent(message)}` +
        `&EntityID=${SHREESMS_ENTITY_ID}` +
        `&TemplateID=${SHREESMS_TEMPLATE_ID}`;

    try {
        const response = await axios.get(url);
        console.log("ShreeSMS Response:", response.data);

        if (response.data.startsWith("ok|")) {
            const addOtpVerificationResult = await addOtpVerification(mobileNumber, otp);
            if (!addOtpVerificationResult) {
                return { success: false, otp: null, error: "Failed to add OTP verification" };
            }
            return { success: true, otp, response: response.data };
        } else {
            return { success: false, otp: null, error: response };
        }
    } catch (error) {
        console.error("Error:", error.message);
        return { success: false, otp: null, error: error.message };
    }
}

async function addOtpVerification(mobileNumber, otp) {
    try {
        await OtpVerification.findOneAndUpdate(
            { mobileNumber },
            {
                $set: {
                    otp,
                    expiresAt: Date.now() + (otpExpiryMinutes * 60 * 1000), // 10 minutes
                    isVerified: false,
                    attempts: 0,
                    updatedAt: Date.now()
                }
            },
            { upsert: true, new: true }
        );
        return true;
    } catch (error) {
        console.error("Error in addOtpVerification:", error.message);
        return false;
    }
}

async function verifyOtpDB(mobileNumber, otp) {
    try {
        const otpVerification = await OtpVerification.findOne({ mobileNumber });
        if (!otpVerification) {
            return {
                status : false,
                message : "Generate OTP first"
            };
        }
        if (otpVerification.otp !== otp) {
            otpVerification.attempts++;
            await otpVerification.save();
            if (otpVerification.attempts >= 3) {
                await OtpVerification.deleteOne({ mobileNumber });
                return {
                    status : false,
                    message : "Too many attempts"
                };
            }
            return {
                status : false,
                message : "Invalid OTP"
            };
        }
        if (otpVerification.expiresAt < Date.now()) {
            // delete otpVerification
            await OtpVerification.deleteOne({ mobileNumber });
            return {
                status : false,
                message : "OTP has expired"
            };
        }
        // Burn the OTP on success — otherwise it stays valid and replayable
        // by anyone who also saw it (shared device, intercepted SMS, etc.)
        // for the rest of its expiry window.
        await OtpVerification.deleteOne({ mobileNumber });
        return {
            status : true,
            message : "OTP verified successfully"
        };
    } catch (error) {
        console.error("Error:", error.message);
        return {
            status : false,
            message : "Failed to verify OTP"
        };
    }
}

module.exports = {
    generateOTP,
    sendOTP,
    addOtpVerification,
    verifyOtpDB
};
