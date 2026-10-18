// One-off check: does the dev database already have duplicate
// user.mobileNumber values that would block the new unique+sparse index
// from being created? Read-only aggregation first, then an explicit
// attempt to sync the index so we get a real pass/fail signal instead of
// Mongoose silently failing in the background.
require('dotenv').config();
const mongoose = require('mongoose');
const userModel = require('../app/model/user');

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to', mongoose.connection.name);

    const duplicates = await userModel.aggregate([
        { $match: { mobileNumber: { $ne: null, $exists: true, $ne: '' } } },
        { $group: { _id: '$mobileNumber', count: { $sum: 1 }, ids: { $push: '$_id' }, names: { $push: '$fullName' } } },
        { $match: { count: { $gt: 1 } } },
    ]);

    if (duplicates.length) {
        console.log(`Found ${duplicates.length} duplicate mobile number(s):`);
        duplicates.forEach((d) => {
            console.log(`  ${d._id}: ${d.count} records — ${d.ids.map((id, i) => `${id} (${d.names[i] || 'no name'})`).join(', ')}`);
        });
    } else {
        console.log('No duplicate mobile numbers found.');
    }

    try {
        await userModel.syncIndexes();
        console.log('Index sync: SUCCEEDED — unique+sparse index on mobileNumber is now active.');
    } catch (err) {
        console.log('Index sync: FAILED —', err.message);
    }

    await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
