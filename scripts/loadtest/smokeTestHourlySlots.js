const axios = require('axios');
const moment = require('moment');
const sessions = require('./sessions.json');

const base = 'http://localhost:3555/medicare/';

const run = async () => {
    const session = sessions[2];
    const auth = { headers: { Authorization: 'Bearer ' + session.token } };
    const today = moment().format('YYYY-MM-DD');
    const dayName = moment().format('dddd').toLowerCase();

    // Shift spans from 5 min from now to 125 min from now — guarantees it
    // crosses at least 2 clock-hour boundaries regardless of current minute.
    const shiftStart = moment().add(5, 'minutes').format('HH:mm');
    const shiftEnd = moment().add(125, 'minutes').format('HH:mm');
    console.log(`Shift: ${shiftStart}-${shiftEnd}, 10-min slots, today=${dayName}`);

    const addRes = await axios.post(base + 'admin/adddoctor', {
        name: 'Dr. Hourly Test', email: `hourlytest.${Date.now()}@queueless.local`,
        mobileNumber: '7000000002', age: '40', gender: 'Female', hospitalId: session.hospitalId,
        appointmentCharge: '500', averageAppointmentTime: 10,
        workingHours: { [dayName]: { isAvailable: true, shifts: [{ start: shiftStart, end: shiftEnd }] } },
    }, auth);
    const doctorId = addRes.data.data._id;
    console.log('Created doctor:', doctorId);

    // 1. getSlotsDetails should now return HOUR buckets, not 10-min slots.
    const slotsRes = await axios.post(base + 'admin/getSlotsDetails', { doctorId, date: today }, auth);
    const hours = slotsRes.data.data.availableSlots;
    console.log(`\nHour buckets returned: ${hours.length}`);
    console.log(hours);
    const looksHourly = hours.every((h) => h.startTime.endsWith(':00') && h.endTime.endsWith(':00'));
    console.log('All buckets are clock-hour aligned:', looksHourly);

    if (hours.length < 2) {
        console.log('Not enough hour buckets for a meaningful test — aborting.');
        return;
    }

    const targetHour = hours[0]; // fill this one completely
    console.log(`\nFilling hour ${targetHour.timeRange} completely...`);

    // Book repeatedly using the SAME hour value — each booking should
    // auto-advance to the next free fine slot inside that hour (first-fit),
    // until the hour is exhausted.
    let bookedTimes = [];
    for (let i = 0; i < 10; i++) {
        try {
            const res = await axios.post(base + 'admin/addappointment', {
                fullName: `Hourly Patient ${i}`, mobilenumber: `7222${String(i).padStart(6, '0')}`,
                doctorId, hospitalId: session.hospitalId, appointmentDate: today,
                appointmentTime: targetHour.startTime, disease: 'test',
            }, auth);
            if (res.data.success || res.data.status === 200) bookedTimes.push('booked');
        } catch (e) {
            console.log(`  booking #${i} rejected:`, e.response?.data?.message);
            break;
        }
    }
    console.log(`Successfully booked ${bookedTimes.length} appointments into ${targetHour.timeRange} (expect 6 for a 1-hour/10-min shift)`);

    // Confirm the actual stored appointmentTime values are fine-grained
    // (not all literally equal to the hour's start).
    const listRes = await axios.post(base + 'admin/getappointmentswithdetails', { dateFilter: 'today', hospitalId: session.hospitalId }, auth);
    const thisDoctorAppts = listRes.data.data
        .filter((a) => String(a.doctorId) === String(doctorId))
        .flatMap((a) => a.appointmentDetails.map((d) => d.appointmentTime))
        .sort();
    console.log('Actual stored fine-grained times:', thisDoctorAppts);

    // 2. Re-check getSlotsDetails — the filled hour should now show
    // available:false while other hours remain available:true.
    const slotsRes2 = await axios.post(base + 'admin/getSlotsDetails', { doctorId, date: today }, auth);
    const hours2 = slotsRes2.data.data.availableSlots;
    console.log('\nHour buckets after filling one hour:');
    console.log(hours2);
    const filledHourNowFull = hours2.find((h) => h.startTime === targetHour.startTime)?.available === false;
    const otherHourStillOpen = hours2.some((h) => h.startTime !== targetHour.startTime && h.available === true);
    console.log('Filled hour now shows available:false:', filledHourNowFull);
    console.log('At least one other hour still available:true:', otherHourStillOpen);

    // 3. Try booking into the now-full hour again — should be rejected.
    try {
        await axios.post(base + 'admin/addappointment', {
            fullName: 'Overflow Patient', mobilenumber: '7999999998', doctorId, hospitalId: session.hospitalId,
            appointmentDate: today, appointmentTime: targetHour.startTime, disease: 'test',
        }, auth);
        console.log('\nUNEXPECTED: booking into full hour succeeded');
    } catch (e) {
        console.log('\nBooking into full hour correctly rejected:', e.response?.data?.message);
    }
};

run().catch((err) => {
    console.error('SMOKE TEST FAILED:', err.response?.data || err.message);
    process.exit(1);
});
