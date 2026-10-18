require('dotenv').config();
const axios = require('axios');
const moment = require('moment');
const mongoose = require('mongoose');
const { generateToken } = require('../../app/helper/jwt');
const sessions = require('./sessions.json');

const base = 'http://localhost:3555/medicare/';

const run = async () => {
    await mongoose.connect('mongodb://localhost:27017/medicare_loadtest');
    const userModel = require('../../app/model/user');

    // Fresh primary patient account (direct DB insert, like a real OTP
    // signup would produce) + its JWT, same shape verifyOtp issues.
    const primary = await userModel.create({ fullName: 'Primary Patient', mobileNumber: '7900011001' });
    const primaryToken = generateToken({ id: primary._id, role: 'user' });
    const primaryAuth = { headers: { Authorization: 'Bearer ' + primaryToken } };

    // A second, unrelated patient — used to prove cross-account isolation.
    const stranger = await userModel.create({ fullName: 'Stranger Patient', mobileNumber: '7900099999' });
    const strangerToken = generateToken({ id: stranger._id, role: 'user' });
    const strangerAuth = { headers: { Authorization: 'Bearer ' + strangerToken } };

    await mongoose.disconnect();

    // 1. Family members
    const addMember = await axios.post(base + 'user/family/add', { fullName: 'Child Patient', relation: 'Child', gender: 'MALE' }, primaryAuth);
    const memberId = addMember.data.data._id;
    console.log('Added family member:', addMember.data.data.fullName, memberId);

    const listMembers = await axios.post(base + 'user/family/list', {}, primaryAuth);
    console.log('Family members listed:', listMembers.data.data.map((m) => m.fullName));

    try {
        await axios.post(base + 'user/family/edit', { memberId, fullName: 'Hacked Name' }, strangerAuth);
        console.log('UNEXPECTED: stranger edited another account\'s family member');
    } catch (e) {
        console.log('Stranger blocked from editing family member:', e.response?.data?.message);
    }

    // 2. Set up two hospitals/doctors with today's shifts for booking tests.
    const h1 = sessions[7];
    const h2 = sessions[8];
    const dayName = moment().format('dddd').toLowerCase();
    const today = moment().format('YYYY-MM-DD');

    for (const h of [h1, h2]) {
        await axios.post(base + 'admin/updatedoctor', {
            doctorId: h.doctorIds[0],
            workingHours: { [dayName]: { isAvailable: true, shifts: [{ start: '00:00', end: '23:30' }] } },
        }, { headers: { Authorization: 'Bearer ' + h.token } });
    }

    // 3. Patient-facing slot listing
    const slotsRes = await axios.post(base + 'user/appointments/slots', { doctorId: h1.doctorIds[0], date: today }, primaryAuth);
    const firstSlot = slotsRes.data.data.availableSlots.find((s) => s.available);
    console.log('\nPatient-facing slots for hospital 1:', slotsRes.data.data.availableSlots.length, 'hour blocks, first available:', firstSlot?.timeRange);

    // 4. Book for self at hospital 1
    const bookSelf = await axios.post(base + 'user/appointments/book', {
        doctorId: h1.doctorIds[0], hospitalId: h1.hospitalId, appointmentDate: today, appointmentTime: firstSlot.startTime, disease: 'Fever',
    }, primaryAuth);
    console.log('Booked for self:', bookSelf.data.message, bookSelf.data.data.appointmentTime);

    // 5. Book for family member at hospital 2 (different hospital — proves cross-hospital history later)
    const slotsRes2 = await axios.post(base + 'user/appointments/slots', { doctorId: h2.doctorIds[0], date: today }, primaryAuth);
    const firstSlot2 = slotsRes2.data.data.availableSlots.find((s) => s.available);
    const bookMember = await axios.post(base + 'user/appointments/book', {
        forUserId: memberId, doctorId: h2.doctorIds[0], hospitalId: h2.hospitalId, appointmentDate: today, appointmentTime: firstSlot2.startTime, disease: 'Checkup',
    }, primaryAuth);
    console.log('Booked for family member:', bookMember.data.message);

    // 6. Booking for a non-owned user must be rejected
    try {
        await axios.post(base + 'user/appointments/book', {
            forUserId: stranger._id.toString(), doctorId: h1.doctorIds[0], hospitalId: h1.hospitalId, appointmentDate: today, appointmentTime: firstSlot.startTime,
        }, primaryAuth);
        console.log('UNEXPECTED: booked for a non-owned user');
    } catch (e) {
        console.log('Booking for non-owned user correctly rejected:', e.response?.data?.message);
    }

    // 7. isEmergency can't be forced true from the patient endpoint
    try {
        const emergRes = await axios.post(base + 'user/appointments/book', {
            doctorId: h1.doctorIds[0], hospitalId: h1.hospitalId, isEmergency: true, disease: 'test',
        }, primaryAuth);
        console.log('Emergency flag from patient booking — stored appointmentTime (should be a real slot, not "now"):', emergRes.data.data.appointmentTime, '| message:', emergRes.data.message);
    } catch (e) {
        console.log('Emergency booking rejected as expected:', e.response?.data?.message);
    }

    // 8. Medical history — should show both hospitals, both patients
    const historyRes = await axios.post(base + 'user/history/appointments', {}, primaryAuth);
    console.log('\nPatient appointment history count:', historyRes.data.data.length);
    historyRes.data.data.forEach((a) => {
        console.log(`  - ${a.appointmentData.hospital?.[0]?.name} | disease=${a.disease} | userId=${a.appointmentData.userId}`);
    });

    const strangerHistory = await axios.post(base + 'user/history/appointments', {}, strangerAuth);
    console.log('Stranger sees only their own history (should be 0):', strangerHistory.data.data.length);

    // 9. Cancel the family member's appointment as the primary account
    const memberAppt = historyRes.data.data.find((a) => String(a.appointmentData.userId) === memberId);
    const cancelRes = await axios.post(base + 'admin/cancelappointment', { appointmentId: memberAppt.appointmentData._id }, primaryAuth);
    console.log('\nCancelled family member\'s appointment as primary account:', cancelRes.data.message);

    // 10. Bills — create one via admin for the family member, then fetch via patient API
    const chargeRes = await axios.post(base + 'admin/billing/charges/add', { name: 'Consultation', category: 'Consultation', amount: 500, hospitalId: h1.hospitalId }, { headers: { Authorization: 'Bearer ' + h1.token } });
    await axios.post(base + 'admin/billing/add', {
        hospitalId: h1.hospitalId, userId: memberId, patientName: 'Child Patient', patientMobile: '7900011001',
        lineItems: [{ chargeMasterId: chargeRes.data.data._id, quantity: 1 }],
    }, { headers: { Authorization: 'Bearer ' + h1.token } });

    const myBills = await axios.post(base + 'user/history/bills', {}, primaryAuth);
    console.log('\nPatient bills (should include the family member\'s bill):', myBills.data.data.map((b) => b.billNumber));

    const strangerBills = await axios.post(base + 'user/history/bills', {}, strangerAuth);
    console.log('Stranger bills (should be 0):', strangerBills.data.data.length);
};

run().catch((err) => {
    console.error('SMOKE TEST FAILED:', err.response?.data || err.message);
    process.exit(1);
});
