const axios = require('axios');
const sessions = require('./sessions.json');

const base = 'http://localhost:3555/medicare/';
const moment = require('moment');

const run = async () => {
    const session = sessions[0];
    const auth = { headers: { Authorization: 'Bearer ' + session.token } };
    const today = moment().format('YYYY-MM-DD');
    const dayName = moment().format('dddd').toLowerCase();
    const shiftStart = moment().subtract(1, 'hour').format('HH:mm');
    const shiftEnd = moment().add(2, 'hour').format('HH:mm');

    console.log(`Today is ${dayName} (${today}); shift ${shiftStart}-${shiftEnd}; 10-min slots`);

    // 1. Create a fresh test doctor with a multi-shift week + today's shift straddling "now".
    const addRes = await axios.post(base + 'admin/adddoctor', {
        name: 'Dr. Smoke Test', email: `smoketest.${Date.now()}@queueless.local`,
        mobileNumber: '7000000001', age: '35', gender: 'Male', hospitalId: session.hospitalId,
        appointmentCharge: '500', averageAppointmentTime: 10,
        workingHours: {
            [dayName]: { isAvailable: true, shifts: [{ start: shiftStart, end: shiftEnd }] },
        },
    }, auth);
    const doctorId = addRes.data.data._id;
    console.log('Created doctor:', doctorId, 'workingHours.' + dayName, JSON.stringify(addRes.data.data.workingHours[dayName]));

    // 2. List slots — expect only future slots within the shift (past excluded).
    const slotsRes1 = await axios.post(base + 'admin/getSlotsDetails', { doctorId, date: today }, auth);
    const slots1 = slotsRes1.data.data.availableSlots;
    console.log(`\nSlots before booking: ${slots1.length} available, dayStatus=${slotsRes1.data.data.dayStatus}`);
    console.log('First 3:', slots1.slice(0, 3));

    if (!slots1.length) {
        console.log('No slots returned — aborting rest of smoke test.');
        return;
    }

    // 3. Book every available slot in the current hour-ish window and confirm capacity enforcement.
    let bookedCount = 0;
    for (const slot of slots1) {
        const bookRes = await axios.post(base + 'admin/addappointment', {
            fullName: `Patient ${bookedCount + 1}`, mobilenumber: `71111${String(bookedCount).padStart(5, '0')}`,
            doctorId, hospitalId: session.hospitalId, appointmentDate: today, appointmentTime: slot.startTime, disease: 'test',
        }, auth);
        if (bookRes.data.status === 200 || bookRes.data.success) bookedCount++;
    }
    console.log(`\nBooked ${bookedCount}/${slots1.length} slots.`);

    // 4. Re-list — should now show 0 available, dayStatus fully_booked.
    const slotsRes2 = await axios.post(base + 'admin/getSlotsDetails', { doctorId, date: today }, auth);
    console.log(`Slots after booking all: ${slotsRes2.data.data.availableSlots.length} available, dayStatus=${slotsRes2.data.data.dayStatus}`);

    // 5. Try a normal booking on the full day — should be rejected.
    try {
        await axios.post(base + 'admin/addappointment', {
            fullName: 'Overflow Patient', mobilenumber: '7999999999', doctorId, hospitalId: session.hospitalId,
            appointmentDate: today, appointmentTime: slots1[0].startTime, disease: 'test',
        }, auth);
        console.log('UNEXPECTED: overflow booking succeeded (should have been rejected)');
    } catch (e) {
        console.log('Overflow booking correctly rejected:', e.response?.data?.message);
    }

    // 6. Emergency booking as hospital role — should succeed even though day is full.
    const emergencyRes = await axios.post(base + 'admin/addappointment', {
        fullName: 'Emergency Patient', mobilenumber: '7888888888', doctorId, hospitalId: session.hospitalId,
        isEmergency: true, disease: 'emergency test',
    }, auth);
    console.log('\nEmergency booking (hospital role):', emergencyRes.data.message);

    // 7. Cancel one of the NORMAL (non-emergency) grid-slot bookings — not
    // the emergency one, which sits off-grid and wouldn't free a clean slot.
    const listRes = await axios.post(base + 'admin/getappointmentswithdetails', { dateFilter: 'today', hospitalId: session.hospitalId }, auth);
    const apptForThisDoctor = listRes.data.data.find((a) =>
        String(a.doctorId) === String(doctorId) &&
        a.appointmentDetails?.some((d) => !d.isEmergency && d.status !== 'Cancelled')
    );
    const appointmentIdToCancel = apptForThisDoctor._id;
    const cancelRes = await axios.post(base + 'admin/cancelappointment', { appointmentId: appointmentIdToCancel }, auth);
    console.log('\nCancel result:', cancelRes.data.message);

    const slotsRes3 = await axios.post(base + 'admin/getSlotsDetails', { doctorId, date: today }, auth);
    console.log('Slots after one cancellation:', slotsRes3.data.data.availableSlots.length, 'available (expect 1)');

    // 8. Confirm the cancelled appointment still shows up in the list (status Cancelled), not gone.
    const listRes2 = await axios.post(base + 'admin/getappointmentswithdetails', { dateFilter: 'today', hospitalId: session.hospitalId }, auth);
    const cancelledEntry = listRes2.data.data.find((a) => String(a._id) === String(appointmentIdToCancel));
    const cancelledDetail = cancelledEntry?.appointmentDetails?.find((d) => d.status === 'Cancelled');
    console.log('Cancelled appointment still visible in list:', !!cancelledEntry, '| status Cancelled:', !!cancelledDetail);

    // 9. Mark the doctor on full-day leave for today and confirm cascade-cancellation of remaining bookings.
    const leaveRes = await axios.post(base + 'admin/doctor/leave/add', { doctorId, date: today, type: 'full', reason: 'Smoke test holiday' }, auth);
    console.log('\nLeave added, cascadeCancelled:', leaveRes.data.data.cancelledAppointments);

    const slotsRes4 = await axios.post(base + 'admin/getSlotsDetails', { doctorId, date: today }, auth);
    console.log('Slots after marking holiday:', slotsRes4.data.data.availableSlots.length, 'available, dayStatus=' + slotsRes4.data.data.dayStatus);

    // 10. Emergency booking should now be rejected (doctor on leave).
    try {
        await axios.post(base + 'admin/addappointment', {
            fullName: 'Emergency Patient 2', mobilenumber: '7777777777', doctorId, hospitalId: session.hospitalId,
            isEmergency: true, disease: 'emergency test 2',
        }, auth);
        console.log('UNEXPECTED: emergency booking succeeded on a holiday (should have been rejected)');
    } catch (e) {
        console.log('Emergency booking on holiday correctly rejected:', e.response?.data?.message);
    }

    // 11. getMonthAvailability sanity check.
    const month = moment().format('YYYY-MM');
    const monthRes = await axios.post(base + 'admin/doctor/monthAvailability', { doctorId, month }, auth);
    const todayEntry = monthRes.data.data.find((d) => d.date === today);
    console.log('\nMonth availability for today:', todayEntry);
};

run().catch((err) => {
    console.error('SMOKE TEST FAILED:', err.response?.data || err.message);
    process.exit(1);
});
