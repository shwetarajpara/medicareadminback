const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const userModel = require('../../model/user');
const { sendOTP, verifyOtpDB } = require('../../helper/otpService');
const { successResponse, errorResponse, saveModel, selectdata, selectdatv2, updateModel } = require('../../helper/index');
const doctorModel = require('../../model/doctor');
const hospitalModel = require('../../model/hospital');
const user = require('../../model/user');
const certificateModel = require('../../model/certificate');
const { hashPassword } = require('../../helper/password');
const { generateToken } = require('../../helper/jwt');

// POST route to create or edit an user
const addEditUser = async (req, res) => {
    let userId = req.body.userId || "";
    let fullName = req.body.fullName || "";
    let mobileNumber = req.body.mobileNumber || "";
    let gender = req.body.gender || "";
    let email = req.body.email || "";
    let address = req.body.address || "";
    let stateId = req.body.stateId || "";
    let cityId = req.body.cityId || "";
    let zipCode = req.body.zipCode || "";
    let password = req.body.password || "";
    let profile = req.file ? `user/profiles/${req.file.filefullName}` : req.body.profile || "";
    let registerAppVersion = req.body.registerAppVersion || "";
    let registerOS = req.body.registerOS || "";
    let registerDevice = req.body.registerDevice || "";

    try {
        let field = {
            fullName, mobileNumber, address, email, gender, stateId, cityId, zipCode,
            registerAppVersion, registerOS, registerDevice
        };
        if (profile) {
            field.profile = profile;
        }

        if (userId) {
            // Edit existing user — only the account owner may edit it.
            // (Creating a brand-new account, the `else` branch below, stays
            // open with no token: it runs right after OTP verification,
            // before any token exists yet, as part of registration.)
            if (!req.auth || String(req.auth.id) !== String(userId)) {
                return errorResponse(res, 'Not authorized to edit this profile');
            }

            let user = await userModel.findById(userId);
            if (!user) {
                return errorResponse(res, 'Usder not found');
            }

            // Check if email or mobile number already exists for another user
            let existingUser = await userModel.findOne({
                $or: [{ email }, { mobileNumber }],
                _id: { $ne: userId }
            });
            if (existingUser) {
                return errorResponse(res, 'User with this email or mobile number already exists');
            }

            field.update = new Date();
            const updatedUser = await updateModel(userModel, { _id: userId }, field);
            return successResponse(res, 'User updated successfully', { ...updatedUser.toObject(), password: undefined });
        } else {
            // Check if email or mobile number already exists
            let existingUser = await userModel.findOne({ $or: [{ email }, { mobileNumber }] });
            if (existingUser) {
                return errorResponse(res, 'User with this email or mobile number already exists');
            }

            if (password) {
                field.password = await hashPassword(password);
            }
            const savedUser = await saveModel(userModel, field);
            return successResponse(res, 'User created successfully', { ...savedUser.toObject(), password: undefined });
        }
    } catch (error) {
        console.error('Error creating/updating user:', error);
        return errorResponse(res, 'Error creating/updating user');
    }
}

// login 
const login = async (req, res) => {
    let mobileNumber = req.body.mobileNumber || "";
    let password = req.body.password || "";

    try {
        const user = await userModel.findOne({
            $or: [{ mobileNumber: mobileNumber }],
            delete: false,
            // password: md5(password)
        });
        if (!user) {
            return errorResponse(res, 'Invalid credentials');
        }

        const response = await sendOTP(user.mobileNumber);
        if (response.success) {
            return successResponse(res, 'Login successful', { ...user.toObject(), password: undefined });
        }
        return errorResponse(res, 'Error logging in');
    } catch (error) {
        console.error('Error logging in:', error);
        return errorResponse(res, error);
    }
}

// user profile
const userProfile = async (req, res) => {
    const userId = req.body.userId || "";
    const limit = req.body.limit || 0;
    const offset = req.body.offset || 0;
    const searchQuery = req.body.searchQuery || "";

    try {
        let field = `fullName email mobileNumber address profile`;
        let data = await selectdatv2(userModel, { _id: userId, delete: false }, field, limit, offset, field, searchQuery, { createdAt: -1 });
        if (data.length == 0) {
            return errorResponse(res, 'User not found');
        }
        return successResponse(res, 'User profile fetched successfully', data, true);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return errorResponse(res, 'Error fetching user profile');
    }
}

// verify otp
const verifyOtp = async (req, res) => {
    let mobileNumber = req.body.mobileNumber || "";
    let otp = req.body.otp || "";

    try {
        let response = await verifyOtpDB(mobileNumber, otp);
        const user = await userModel.findOne({ mobileNumber: mobileNumber });
        if (!req.body.isRegister) {
            if (!user) {
                return errorResponse(res, 'User not found');
            }
            response.userDetails = { ...user.toObject(), password: undefined };
        }

        if (response.status) {
            if (user) {
                response.token = generateToken({ id: user._id, role: 'user' });
            }
            return successResponse(res, 'Login successful', response);
        }
        return errorResponse(res, response.message || 'OTP verification failed');
    } catch (error) {
        console.error('Error logging in:', error);
        return errorResponse(res, 'Error logging in');
    }
}

const registrationOtp = async (req, res) => {
    try {
        const { mobileNumber } = req.body;
        const userDetails = await user.findOne({ mobileNumber: mobileNumber });
        let response;
        if (!userDetails) {
            response = await sendOTP(mobileNumber);
        }
        console.log(response);
        if (response.success) {
            return successResponse(res, 'Otp for registration is sent successfully');
        }
    } catch (e) {
        return errorResponse(res, "Error while sending otp");
    }
}

const searchDoctorsAndHospitalsByName = async (req, res) => {
    try {
        const { name = "", limit = 10, offset = 0 } = req.body;

        if (!name.trim()) {
            return errorResponse(res, "Name is required for search.");
        }

        const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRegex = new RegExp(escapedName, 'i'); // Case-insensitive partial match

        // Search doctors by name
        const doctors = await doctorModel.find({
            delete: false,
            name: nameRegex
        })
            .select('name email mobileNumber specializationId degreeId hospitalId appointmentCharge experience profile age gender')
            .populate({ path: 'specializationId', select: 'name' })
            .populate({ path: 'degreeId', select: 'name' })
            .populate({ path: 'hospitalId', select: 'name email mobileNumber address' })
            .skip(parseInt(offset))
            .limit(parseInt(limit));

        // Search hospitals by name
        const hospitals = await hospitalModel.find({
            delete: false,
            name: nameRegex
        })
            .select('name email mobileNumber address city type specializationDescription profile')
            .skip(parseInt(offset))
            .limit(parseInt(limit));

        return successResponse(res, 'Search results fetched successfully', {
            doctors,
            hospitals
        });

    } catch (error) {
        console.error('Error in name search:', error);
        return errorResponse(res, 'Error fetching search results');
    }
};

// --- Patient-facing certificate access (mobile app) ---
// Scoped entirely from req.auth.id (the token) — a patient's own mobile
// number is looked up server-side from their own user document, never
// trusted from the request body, so this can never be pointed at another
// patient's records. Matches by userId OR by mobile number, since many
// certificates are created by hospital staff as walk-ins (patientMobile
// only, no userId link) before/without the patient ever having an app
// account at all.
const getMyCertificates = async (req, res) => {
    try {
        const me = await userModel.findById(req.auth.id).select('mobileNumber');
        if (!me) {
            return errorResponse(res, 'User not found');
        }

        const certificates = await certificateModel.find({
            delete: false,
            $or: [
                { userId: req.auth.id },
                ...(me.mobileNumber ? [{ patientMobile: me.mobileNumber }] : []),
            ],
        })
            .populate('hospitalId', 'name address city')
            .sort({ create: -1 });

        return successResponse(res, 'Certificates fetched successfully', { certificates });
    } catch (error) {
        console.error('Error fetching my certificates:', error);
        return errorResponse(res, 'Error fetching certificates');
    }
};

const getMyCertificateDetail = async (req, res) => {
    try {
        const { certificateId } = req.body;
        if (!certificateId) {
            return errorResponse(res, 'certificateId is required');
        }

        const me = await userModel.findById(req.auth.id).select('mobileNumber');
        if (!me) {
            return errorResponse(res, 'User not found');
        }

        const certificate = await certificateModel.findOne({
            _id: certificateId,
            delete: false,
            $or: [
                { userId: req.auth.id },
                ...(me.mobileNumber ? [{ patientMobile: me.mobileNumber }] : []),
            ],
        }).populate('hospitalId', 'name address city');

        if (!certificate) {
            // Deliberately the same message whether it doesn't exist or
            // belongs to someone else — don't confirm other patients' IDs.
            return errorResponse(res, 'Certificate not found');
        }

        return successResponse(res, 'Certificate fetched successfully', certificate);
    } catch (error) {
        console.error('Error fetching certificate:', error);
        return errorResponse(res, 'Error fetching certificate');
    }
};

module.exports = {
    addEditUser,
    login,
    userProfile,
    verifyOtp,
    registrationOtp,
    searchDoctorsAndHospitalsByName,
    getMyCertificates,
    getMyCertificateDetail,
}