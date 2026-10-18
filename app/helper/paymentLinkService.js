// paymentLinkService.js
// Wraps the external UPI-link microservice. This used to be called directly
// from the browser (admin/src/Components/DisplayQr.jsx), which meant payment
// status could never be tracked server-side. Routing it through here lets a
// Bill record own the link + status instead.
const axios = require('axios');
require('dotenv').config();

const PAYMENT_LINK_BASE_URL = process.env.PAYMENT_LINK_BASE_URL || 'https://queueless-payment.onrender.com';

async function createUpiLink({ name, amount, date }) {
    const response = await axios.post(`${PAYMENT_LINK_BASE_URL}/api/create-upi-link`, {
        name, amount, date,
    });

    return {
        url: response.data.upiLink,
        provider: 'queueless-payment',
        externalRef: response.data.referenceId || null,
    };
}

module.exports = { createUpiLink };
