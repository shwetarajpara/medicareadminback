require('dotenv').config();
const mongoose = require('mongoose');
const hospitalModel = require('../app/model/hospital');
const adminModel = require('../app/model/admin');
const { hashPassword } = require('../app/helper/password');

// Known test accounts created during earlier dev/testing of this app —
// not a blind "reset every account" sweep, which could clobber real data
// this script has no way to distinguish from test data.
const HOSPITAL_EMAILS = [
    'testhospital@queueless.local',
    'secondhospital@queueless.local',
    'citycare@queueless.local',
    'sunrise@queueless.local',
];
const ADMIN_EMAILS = [
    'testadmin@queueless.local',
    'superadmin@test.local',
];

const NEW_PASSWORD = 'Test@1234';

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const hash = await hashPassword(NEW_PASSWORD);
    const results = [];

    for (const email of HOSPITAL_EMAILS) {
        const hospital = await hospitalModel.findOne({ email, delete: false });
        if (!hospital) {
            results.push({ email, role: 'hospital', status: 'not found' });
            continue;
        }
        hospital.password = hash;
        await hospital.save();
        results.push({ email, role: 'hospital', name: hospital.name, status: 'reset' });
    }

    for (const email of ADMIN_EMAILS) {
        const admin = await adminModel.findOne({ email });
        if (!admin) {
            results.push({ email, role: 'admin', status: 'not found' });
            continue;
        }
        admin.password = hash;
        await admin.save();
        results.push({ email, role: 'admin', name: admin.fullName, status: 'reset' });
    }

    console.log(JSON.stringify(results, null, 2));
    console.log('New password for every "reset" account above:', NEW_PASSWORD);
    await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
