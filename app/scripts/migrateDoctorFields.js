// One-time migration: run this BEFORE deploying the doctor.specializationId /
// doctor.hospitalId schema change (String -> ObjectId ref).
//
// Existing doctor documents may have specializationId/hospitalId stored as ""
// (the Add Doctor form has been broken and never set a real specialization,
// and some old rows may have non-ObjectId hospitalId values). Loading those
// documents under the new ObjectId schema throws a CastError. This script
// clears any value that isn't a valid ObjectId so existing rows load cleanly;
// doctors with cleared specializationId will just show "unassigned" until an
// admin re-selects one.
//
// Run with: node app/scripts/migrateDoctorFields.js

require('dotenv').config();
const mongoose = require('mongoose');
const connectToMongo = require('../connection/db');

async function migrate() {
    await connectToMongo();

    const db = mongoose.connection.db;
    const doctors = db.collection('doctors');

    const isValidObjectId = (v) => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v) && v.length === 24;

    const cursor = doctors.find({});
    let scanned = 0, fixed = 0;

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        scanned++;

        const unset = {};
        if (doc.specializationId !== undefined && !isValidObjectId(doc.specializationId)) {
            unset.specializationId = "";
        }
        if (doc.hospitalId !== undefined && !isValidObjectId(doc.hospitalId)) {
            unset.hospitalId = "";
        }

        if (Object.keys(unset).length > 0) {
            await doctors.updateOne({ _id: doc._id }, { $unset: unset });
            fixed++;
        }
    }

    console.log(`Scanned ${scanned} doctor(s), cleaned ${fixed} invalid reference(s).`);
    process.exit(0);
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
