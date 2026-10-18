// Seeds a throwaway local database with synthetic hospitals/departments/
// doctors for load testing. Never touches the real dev DB — the DB name
// comes from LOADTEST_MONGO_URI (defaults to a dedicated local DB name
// distinct from whatever MONGO_URI points to in .env).
require('dotenv').config();
const mongoose = require('mongoose');
const hospitalModel = require('../../app/model/hospital');
const specializationModel = require('../../app/model/specialization');
const doctorModel = require('../../app/model/doctor');
const { generateToken } = require('../../app/helper/jwt');

const MONGO_URI = process.env.LOADTEST_MONGO_URI || 'mongodb://localhost:27017/medicare_loadtest';
const NUM_HOSPITALS = parseInt(process.env.LOADTEST_HOSPITALS || '1000', 10);
const DEPTS_PER_HOSPITAL = 2;
const DOCTORS_PER_DEPT = 2; // 4 doctors/hospital total

const workingHours = () => {
    const day = { start: '09:00', end: '20:00', isAvailable: true, breaks: [] };
    return { monday: day, tuesday: day, wednesday: day, thursday: day, friday: day, saturday: day, sunday: { ...day, isAvailable: false } };
};

const run = async () => {
    await mongoose.connect(MONGO_URI);
    console.log('Seeding into', MONGO_URI);

    // Wipe any previous load-test run so numbers are reproducible.
    await Promise.all([
        hospitalModel.deleteMany({}),
        specializationModel.deleteMany({}),
        doctorModel.deleteMany({}),
    ]);

    const hospitalDocs = Array.from({ length: NUM_HOSPITALS }, (_, i) => ({
        ownerName: `Load Test Owner ${i}`,
        name: `Load Test Hospital ${i}`,
        email: `loadtest${i}@queueless.local`,
        mobileNumber: `9${String(1000000000 + i).slice(0, 9)}`,
        type: 'Multispeciality',
        address: 'Test Address', city: 'Test City', state: 'Test State', pincode: '000000',
    }));
    const hospitals = await hospitalModel.insertMany(hospitalDocs, { ordered: false });
    console.log(`Inserted ${hospitals.length} hospitals`);

    const specializationDocs = [];
    for (const hospital of hospitals) {
        for (let d = 0; d < DEPTS_PER_HOSPITAL; d++) {
            specializationDocs.push({ name: d === 0 ? 'General Medicine' : 'Orthopedics', hospitalId: hospital._id });
        }
    }
    const specializations = await specializationModel.insertMany(specializationDocs, { ordered: false });
    console.log(`Inserted ${specializations.length} departments`);

    // Group departments back by hospital for doctor assignment.
    const deptsByHospital = new Map();
    for (const spec of specializations) {
        const key = String(spec.hospitalId);
        if (!deptsByHospital.has(key)) deptsByHospital.set(key, []);
        deptsByHospital.get(key).push(spec);
    }

    const doctorDocs = [];
    for (const hospital of hospitals) {
        const depts = deptsByHospital.get(String(hospital._id));
        let n = 0;
        for (const dept of depts) {
            for (let k = 0; k < DOCTORS_PER_DEPT; k++) {
                n++;
                doctorDocs.push({
                    name: `Dr. Load ${n} @ ${hospital.name}`,
                    email: `doctor${n}.${String(hospital._id)}@queueless.local`,
                    mobileNumber: `8${String(1000000000 + n).slice(0, 9)}`,
                    specializationId: dept._id,
                    hospitalId: hospital._id,
                    degree: 'MBBS',
                    appointmentCharge: '500',
                    averageAppointmentTime: 15,
                    experience: '5',
                    age: '40',
                    gender: 'Male',
                    workingHours: workingHours(),
                    isAvailable: true,
                });
            }
        }
    }
    const doctors = await doctorModel.insertMany(doctorDocs, { ordered: false });
    console.log(`Inserted ${doctors.length} doctors`);

    // One valid JWT per hospital (role: 'hospital'), generated the same way
    // the real login flow does — the load test authenticates as these
    // hospitals without needing to actually log in 1000 times.
    const doctorsByHospital = new Map();
    for (const doc of doctors) {
        const key = String(doc.hospitalId);
        if (!doctorsByHospital.has(key)) doctorsByHospital.set(key, []);
        doctorsByHospital.get(key).push(doc);
    }

    const sessions = hospitals.map((hospital) => ({
        hospitalId: String(hospital._id),
        token: generateToken({ id: hospital._id, role: 'hospital' }),
        doctorIds: (doctorsByHospital.get(String(hospital._id)) || []).map((d) => String(d._id)),
    }));

    const fs = require('fs');
    const path = require('path');
    const outPath = path.join(__dirname, 'sessions.json');
    fs.writeFileSync(outPath, JSON.stringify(sessions));
    console.log(`Wrote ${sessions.length} hospital sessions to ${outPath}`);

    await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
