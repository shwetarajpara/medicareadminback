// abdmClient.js
//
// Thin wrapper around ABDM's gateway auth + ABHA v3 APIs. Covers only the
// plumbing every milestone (M1/M2/M3) needs: getting/refreshing a gateway
// session token, fetching+caching ABDM's RSA public certificate, and
// RSA-OAEP encrypting the identifiers (Aadhaar/mobile/OTP) ABDM requires to
// be encrypted client-side before they're ever sent.
//
// Credentials come from env vars, not per-hospital DB fields — in ABDM's
// actual architecture one software vendor registers ONE "bridge" (one
// Client ID/Secret), and individual hospitals are linked under it via their
// own HFR ID (see hospital.abdm.hfrId). The hospital.abdm.clientId field is
// a display/reference copy only, not read here.
//
// IMPORTANT: this only ever targets the ABDM **sandbox** until you've done
// the real-world HFR registration + security certification described in the
// plan. Never point ABDM_ENV at "production" without that in place.

const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const ABDM_ENV = process.env.ABDM_ENV || 'sandbox';

const BASE_URLS = {
    sandbox: {
        gateway: 'https://dev.abdm.gov.in',
        abha: 'https://abhasbx.abdm.gov.in/abha/api/v3',
        cmId: 'sbx',
    },
    production: {
        gateway: 'https://live.abdm.gov.in',
        abha: 'https://abha.abdm.gov.in/abha/api/v3',
        cmId: 'in.ndhm',
    },
};

const getBaseUrls = () => BASE_URLS[ABDM_ENV] || BASE_URLS.sandbox;

// ---- Gateway session token (client_credentials grant, ~600s expiry) ----

let cachedToken = null;
let cachedTokenExpiresAt = 0;

const getGatewaySessionToken = async () => {
    const now = Date.now();
    if (cachedToken && now < cachedTokenExpiresAt) {
        return cachedToken;
    }

    const clientId = process.env.ABDM_CLIENT_ID;
    const clientSecret = process.env.ABDM_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('ABDM_CLIENT_ID / ABDM_CLIENT_SECRET are not configured in .env — register on the ABDM sandbox first.');
    }

    const { gateway } = getBaseUrls();
    const response = await axios.post(`${gateway}/api/hiecm/gateway/v3/sessions`, {
        clientId,
        clientSecret,
        grantType: 'client_credentials',
    });

    cachedToken = response.data.accessToken;
    // Refresh a little early (gateway tokens are ~600s) rather than racing expiry.
    cachedTokenExpiresAt = now + ((response.data.expiresIn || 600) - 30) * 1000;
    return cachedToken;
};

// Standard headers every ABDM gateway/ABHA call needs beyond Authorization.
const buildStandardHeaders = async (extra = {}) => {
    const token = await getGatewaySessionToken();
    const { cmId } = getBaseUrls();
    return {
        Authorization: `Bearer ${token}`,
        'X-CM-ID': cmId,
        'REQUEST-ID': crypto.randomUUID(),
        TIMESTAMP: new Date().toISOString(),
        'Content-Type': 'application/json',
        ...extra,
    };
};

// ---- RSA public certificate (cached — rotates infrequently) ----

let cachedCertPem = null;

const getPublicCertificate = async () => {
    if (cachedCertPem) {
        return cachedCertPem;
    }

    // Confirmed against the real sandbox: this endpoint requires the gateway
    // bearer token too, despite some docs describing it as public.
    const { abha } = getBaseUrls();
    const headers = await buildStandardHeaders();
    const response = await axios.get(`${abha}/profile/public/certificate`, { headers });

    // The endpoint returns a bare PEM block, not JSON.
    cachedCertPem = typeof response.data === 'string' ? response.data : response.data.publicKey;
    return cachedCertPem;
};

// ABDM requires Aadhaar/mobile/OTP/password values to be RSA-OAEP(SHA-1)
// encrypted with its public cert before they're sent in any request body.
const encryptWithAbdmCert = async (plainText) => {
    const pem = await getPublicCertificate();
    const encrypted = crypto.publicEncrypt(
        {
            key: pem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha1',
        },
        Buffer.from(plainText)
    );
    return encrypted.toString('base64');
};

module.exports = {
    getBaseUrls,
    getGatewaySessionToken,
    buildStandardHeaders,
    getPublicCertificate,
    encryptWithAbdmCert,
};
