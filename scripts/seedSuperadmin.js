require('dotenv').config();
const mongoose = require('mongoose');
const adminModel = require('../app/model/admin');
const { hashPassword } = require('../app/helper/password');

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const hash = await hashPassword('Test@1234');
    const admin = await adminModel.create({
        fullName: 'Super Admin', email: 'superadmin@test.local', password: hash,
        mobileNumber: '9000000001',
    });
    console.log(String(admin._id));
    await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
