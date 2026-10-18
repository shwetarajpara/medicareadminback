require('dotenv').config();
const mongoose = require('mongoose');
const hospitalModel = require('../app/model/hospital');
const { hashPassword } = require('../app/helper/password');

const EMAIL = 'testhospital@queueless.local';
const NEW_PASSWORD = 'Test@1234';

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);

    const hospital = await hospitalModel.findOne({ email: EMAIL, delete: false });
    if (!hospital) {
        console.error(`No hospital found with email ${EMAIL}`);
        await mongoose.disconnect();
        process.exit(1);
    }

    hospital.password = await hashPassword(NEW_PASSWORD);
    await hospital.save();

    console.log('Reset password for:', hospital.email, '/', hospital.name, '/ id:', String(hospital._id));
    await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
