// One-off seed for the security-hardening verification pass. Run against the
// local MongoDB only — creates two hospitals (A, B) and one patient with
// known credentials so the verification suite has something to log in as.
require('dotenv').config();
const mongoose = require('mongoose');
const hospitalModel = require('../app/model/hospital');
const userModel = require('../app/model/user');
const { hashPassword } = require('../app/helper/password');

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);

    const hash = await hashPassword('Test@1234');

    const hospitalA = await hospitalModel.create({
        ownerName: 'Hospital A Owner', name: 'Hospital A', email: 'hospitalA@test.local',
        password: hash, mobileNumber: '9000000001', delete: false,
    });
    const hospitalB = await hospitalModel.create({
        ownerName: 'Hospital B Owner', name: 'Hospital B', email: 'hospitalB@test.local',
        password: hash, mobileNumber: '9000000002', delete: false,
    });
    const patient = await userModel.create({
        fullName: 'Test Patient', password: hash, mobileNumber: '9000000099', delete: false,
    });

    console.log(JSON.stringify({
        hospitalAId: String(hospitalA._id),
        hospitalBId: String(hospitalB._id),
        patientId: String(patient._id),
    }));

    await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
