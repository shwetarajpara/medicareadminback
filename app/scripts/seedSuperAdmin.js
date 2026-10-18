// One-time bootstrap script: creates the first Super Admin account.
// Run with: node app/scripts/seedSuperAdmin.js
//
// Needed because /medicare/admin/addeditadmin now requires an existing admin
// token (correctly — it shouldn't be a public registration endpoint), so the
// very first admin account has to be created directly against the database.
//
// Configure via env vars (falls back to local dev defaults if unset):
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME, SEED_ADMIN_MOBILE

require('dotenv').config();
const mongoose = require('mongoose');
const connectToMongo = require('../connection/db');
const adminModel = require('../model/admin');
const { hashPassword } = require('../helper/password');

async function seed() {
    await connectToMongo();

    const email = process.env.SEED_ADMIN_EMAIL || 'admin@queueless.local';
    const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe@123';
    const fullName = process.env.SEED_ADMIN_NAME || 'Super Admin';
    const mobileNumber = process.env.SEED_ADMIN_MOBILE || '';

    const existing = await adminModel.findOne({ email });
    if (existing) {
        console.log(`Admin already exists for ${email} — nothing to do.`);
        process.exit(0);
    }

    const hashed = await hashPassword(password);
    await adminModel.create({ fullName, email, password: hashed, mobileNumber });

    console.log(`Super Admin created: ${email}`);
    console.log('Log in at /admin-login with the email/password you configured (or the defaults above if unset).');
    process.exit(0);
}

seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
