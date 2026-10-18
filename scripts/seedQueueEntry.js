require('dotenv').config();
const mongoose = require('mongoose');
const appointmentdetailModel = require('../app/model/appointmentdetail');

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const doctorId = process.argv[2];
    const userId = process.argv[3];

    const detail = await appointmentdetailModel.create({
        doctorId, userId,
        appointmentDate: new Date(),
        appointmentTime: '10:00',
        status: 'CheckedIn',
        checkedInAt: new Date(),
        delete: false,
    });
    console.log(String(detail._id));
    await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
