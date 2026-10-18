// abhaController.js — ABDM Milestone 1 (ABHA Foundation)
//
// Flows, scoped deliberately to what's reliably documented without a live
// sandbox to verify against (see memory note on this feature):
//   1. Create a brand-new ABHA via Aadhaar OTP (two-step: request OTP, enrol).
//   2. Record an ABHA number/address the patient already has — no external
//      call, so it's the only thing fully exercisable without ABDM credentials.
//   3. Look up an existing ABHA's profile via ABDM's login flow (the "scan
//      QR / enter ABHA ID, fetch details" pattern every mainstream ABDM-
//      compliant HMS ships) — three steps: request OTP, verify OTP (returns
//      a short-lived T-token + the list of ABHA accounts linked to that
//      identifier, since one person can have more than one), then select an
//      account with that T-token to get the actual profile + an X-token.

const userModel = require('../../model/user');
const hospitalModel = require('../../model/hospital');
const { successResponse, errorResponse, updateModel } = require('../../helper/index');
const { buildStandardHeaders, encryptWithAbdmCert, getBaseUrls } = require('../../helper/abdmClient');
const axios = require('axios');

// Every ABHA route first checks the hospital has opted in via Settings.
const requireAbdmEnabled = async (hospitalId) => {
    if (!hospitalId) return false;
    const hospital = await hospitalModel.findById(hospitalId).select('abdm');
    return !!hospital?.abdm?.enabled;
};

// Step 1: request an Aadhaar OTP for ABHA enrollment.
const requestAadhaarOtp = async (req, res) => {
    try {
        const { hospitalId, aadhaarNumber } = req.body;

        if (!(await requireAbdmEnabled(hospitalId))) {
            return errorResponse(res, 'ABHA integration is not enabled for this hospital');
        }
        if (!aadhaarNumber || !/^\d{12}$/.test(aadhaarNumber)) {
            return errorResponse(res, 'A valid 12-digit Aadhaar number is required');
        }

        const encryptedAadhaar = await encryptWithAbdmCert(aadhaarNumber);
        const { abha } = getBaseUrls();
        const headers = await buildStandardHeaders();

        const response = await axios.post(`${abha}/enrollment/request/otp`, {
            txnId: '',
            scope: ['abha-enrol'],
            loginHint: 'aadhaar',
            loginId: encryptedAadhaar,
            otpSystem: 'aadhaar',
        }, { headers });

        return successResponse(res, 'OTP sent to the Aadhaar-registered mobile number', { txnId: response.data.txnId });
    } catch (error) {
        console.error('Error requesting Aadhaar OTP:', error.response?.data || error.message);
        return errorResponse(res, error.response?.data?.message || error.message || 'Error requesting Aadhaar OTP');
    }
};

// Step 2: verify the OTP, complete enrollment, link the resulting ABHA to the local patient record.
const verifyAadhaarOtpAndEnrol = async (req, res) => {
    try {
        const { hospitalId, userId, txnId, otp } = req.body;

        if (!(await requireAbdmEnabled(hospitalId))) {
            return errorResponse(res, 'ABHA integration is not enabled for this hospital');
        }
        if (!userId || !txnId || !otp) {
            return errorResponse(res, 'userId, txnId and otp are required');
        }

        const encryptedOtp = await encryptWithAbdmCert(otp);
        const { abha } = getBaseUrls();
        const headers = await buildStandardHeaders();

        const response = await axios.post(`${abha}/enrollment/enrol/byAadhaar`, {
            authData: {
                authMethods: ['otp'],
                otp: {
                    timeStamp: new Date().toISOString(),
                    txnId,
                    otpValue: encryptedOtp,
                },
            },
            consent: { code: 'abha-enrollment', version: '1.4' },
        }, { headers });

        // Field names vary slightly across ABDM API versions/docs — accept
        // either shape rather than assume one, since this hasn't been
        // verified against a live response yet.
        const profile = response.data?.ABHAProfile || response.data;
        const abhaNumber = profile?.ABHANumber || profile?.healthIdNumber || profile?.abhaNumber;
        const abhaAddress = profile?.preferredAbhaAddress || profile?.healthId || profile?.phrAddress?.[0];

        if (!abhaNumber) {
            console.error('Unexpected ABDM enrol response shape:', JSON.stringify(response.data));
            return errorResponse(res, 'ABHA created but the response shape was unexpected — check server logs');
        }

        const updatedUser = await updateModel(userModel, { _id: userId }, {
            abhaNumber, abhaAddress, abhaVerifiedAt: new Date(), update: new Date(),
        });

        return successResponse(res, 'ABHA created and linked successfully', {
            abhaNumber: updatedUser.abhaNumber, abhaAddress: updatedUser.abhaAddress,
        });
    } catch (error) {
        const errData = error.response?.data;
        console.error('Error completing ABHA enrollment:', errData || error.message);

        // If this Aadhaar already has an ABHA, ABDM signals it as an error
        // rather than silently returning the existing profile. Extract an
        // ABHA number if the error payload happens to include one (varies by
        // version — unconfirmed against a live response); otherwise point
        // the operator at the fallback paths ABDM itself documents.
        const message = (errData?.message || error.message || '').toLowerCase();
        if (message.includes('already exist') || message.includes('already registered')) {
            const existingNumber = errData?.ABHANumber || errData?.healthIdNumber || errData?.abhaNumber;
            if (existingNumber && userId) {
                await updateModel(userModel, { _id: userId }, {
                    abhaNumber: existingNumber, abhaVerifiedAt: new Date(), update: new Date(),
                });
                return successResponse(res, 'This Aadhaar already has an ABHA — linked the existing one', { abhaNumber: existingNumber });
            }
            return errorResponse(res, 'This Aadhaar number already has an ABHA account. If the patient knows their ABHA number/address, use "Link Existing ABHA" instead — otherwise they can retrieve it via their registered mobile number in the ABHA app.');
        }

        return errorResponse(res, errData?.message || error.message || 'Error completing ABHA enrollment');
    }
};

// No external call — patient already has an ABHA from elsewhere, just record it locally.
const linkExistingAbha = async (req, res) => {
    try {
        const { hospitalId, userId, abhaNumber, abhaAddress } = req.body;

        if (!(await requireAbdmEnabled(hospitalId))) {
            return errorResponse(res, 'ABHA integration is not enabled for this hospital');
        }
        if (!userId || (!abhaNumber && !abhaAddress)) {
            return errorResponse(res, 'userId and at least one of abhaNumber/abhaAddress are required');
        }

        const updatedUser = await updateModel(userModel, { _id: userId }, {
            abhaNumber: abhaNumber || undefined,
            abhaAddress: abhaAddress || undefined,
            abhaVerifiedAt: new Date(),
            update: new Date(),
        });

        return successResponse(res, 'ABHA linked successfully', {
            abhaNumber: updatedUser.abhaNumber, abhaAddress: updatedUser.abhaAddress,
        });
    } catch (error) {
        console.error('Error linking existing ABHA:', error);
        return errorResponse(res, 'Error linking existing ABHA');
    }
};

const unlinkAbha = async (req, res) => {
    try {
        const { hospitalId, userId } = req.body;
        if (!(await requireAbdmEnabled(hospitalId))) {
            return errorResponse(res, 'ABHA integration is not enabled for this hospital');
        }
        if (!userId) {
            return errorResponse(res, 'userId is required');
        }

        await updateModel(userModel, { _id: userId }, {
            abhaNumber: null, abhaAddress: null, abhaVerifiedAt: null, update: new Date(),
        });

        return successResponse(res, 'ABHA unlinked successfully');
    } catch (error) {
        console.error('Error unlinking ABHA:', error);
        return errorResponse(res, 'Error unlinking ABHA');
    }
};

// ---- ABHA profile lookup (login) — "patient already has an ABHA, fetch it" ----

// Step 1: request an OTP to look up an existing ABHA via Aadhaar, mobile, or ABHA number/address.
const requestLoginOtp = async (req, res) => {
    try {
        const { hospitalId, loginHint, loginId } = req.body;

        if (!(await requireAbdmEnabled(hospitalId))) {
            return errorResponse(res, 'ABHA integration is not enabled for this hospital');
        }
        if (!['aadhaar', 'mobile', 'abha-number'].includes(loginHint) || !loginId) {
            return errorResponse(res, 'loginHint must be "aadhaar", "mobile", or "abha-number", and loginId is required');
        }

        // ABHA number/address lookups aren't PII in the same sense as Aadhaar,
        // but ABDM's docs encrypt all loginId values uniformly — do the same here.
        const encryptedLoginId = await encryptWithAbdmCert(loginId);
        const { abha } = getBaseUrls();
        const headers = await buildStandardHeaders();

        const response = await axios.post(`${abha}/profile/login/request/otp`, {
            txnId: '',
            scope: ['abha-login', `${loginHint}-verify`],
            loginHint,
            loginId: encryptedLoginId,
            otpSystem: loginHint === 'aadhaar' ? 'aadhaar' : 'abdm',
        }, { headers });

        return successResponse(res, 'OTP sent', { txnId: response.data.txnId });
    } catch (error) {
        console.error('Error requesting login OTP:', error.response?.data || error.message);
        return errorResponse(res, error.response?.data?.message || error.message || 'Error requesting login OTP');
    }
};

// Step 2: verify the OTP — returns a short-lived T-token plus the list of
// ABHA accounts linked to that identifier (there can be more than one).
const verifyLoginOtp = async (req, res) => {
    try {
        const { hospitalId, txnId, otp } = req.body;

        if (!(await requireAbdmEnabled(hospitalId))) {
            return errorResponse(res, 'ABHA integration is not enabled for this hospital');
        }
        if (!txnId || !otp) {
            return errorResponse(res, 'txnId and otp are required');
        }

        const encryptedOtp = await encryptWithAbdmCert(otp);
        const { abha } = getBaseUrls();
        const headers = await buildStandardHeaders();

        const response = await axios.post(`${abha}/profile/login/verify`, {
            authData: {
                authMethods: ['otp'],
                otp: { txnId, otpValue: encryptedOtp },
            },
        }, { headers });

        return successResponse(res, 'OTP verified', {
            tToken: response.data?.token || response.data?.tToken,
            accounts: response.data?.accounts || [],
        });
    } catch (error) {
        console.error('Error verifying login OTP:', error.response?.data || error.message);
        return errorResponse(res, error.response?.data?.message || error.message || 'Error verifying login OTP');
    }
};

// Step 3: pick one of the returned ABHA accounts, fetch its profile, link it to the local patient.
const selectAbhaAccount = async (req, res) => {
    try {
        const { hospitalId, userId, tToken, abhaNumber } = req.body;

        if (!(await requireAbdmEnabled(hospitalId))) {
            return errorResponse(res, 'ABHA integration is not enabled for this hospital');
        }
        if (!userId || !tToken || !abhaNumber) {
            return errorResponse(res, 'userId, tToken and abhaNumber are required');
        }

        const { abha } = getBaseUrls();
        const headers = await buildStandardHeaders({ 'T-token': `Bearer ${tToken}` });

        const response = await axios.post(`${abha}/profile/login/verify/user`, { ABHANumber: abhaNumber }, { headers });

        const profile = response.data?.ABHAProfile || response.data;
        const resolvedAbhaAddress = profile?.preferredAbhaAddress || profile?.phrAddress?.[0];

        const updatedUser = await updateModel(userModel, { _id: userId }, {
            abhaNumber, abhaAddress: resolvedAbhaAddress, abhaVerifiedAt: new Date(), update: new Date(),
        });

        return successResponse(res, 'ABHA profile fetched and linked successfully', {
            abhaNumber: updatedUser.abhaNumber, abhaAddress: updatedUser.abhaAddress,
        });
    } catch (error) {
        console.error('Error fetching ABHA profile:', error.response?.data || error.message);
        return errorResponse(res, error.response?.data?.message || error.message || 'Error fetching ABHA profile');
    }
};

module.exports = {
    requestAadhaarOtp, verifyAadhaarOtpAndEnrol, linkExistingAbha, unlinkAbha,
    requestLoginOtp, verifyLoginOtp, selectAbhaAccount,
};
