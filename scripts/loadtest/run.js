// Custom concurrency-controlled load generator (no autocannon/k6 available
// offline) against the throwaway loadtest backend instance (port 3555,
// pointed at medicare_loadtest + mock WhatsApp — never the real dev DB or
// the real WhatsApp provider). Simulates a realistic read/write traffic mix
// across many hospitals concurrently, at a few concurrency tiers, and
// reports latency percentiles + error rate per tier.
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.LOADTEST_BASE_URL || 'http://localhost:3555/medicare/';
const sessions = JSON.parse(fs.readFileSync(path.join(__dirname, 'sessions.json'), 'utf8'));

const today = new Date().toISOString().slice(0, 10);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const randomTimeSlot = () => {
    const hour = 9 + Math.floor(Math.random() * 9); // 09:00-17:59
    const minute = Math.random() < 0.5 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${minute}`;
};

let patientCounter = 0;

const actions = [
    {
        name: 'getAppointmentsWithDetails',
        weight: 35,
        run: async (session) => axios.post(
            BASE_URL + 'admin/getappointmentswithdetails',
            { dateFilter: 'today', hospitalId: session.hospitalId },
            { headers: { Authorization: `Bearer ${session.token}` }, timeout: 10000 }
        ),
    },
    {
        name: 'getDoctors',
        weight: 25,
        run: async (session) => axios.post(
            BASE_URL + 'admin/getdoctors',
            { hospitalId: session.hospitalId },
            { headers: { Authorization: `Bearer ${session.token}` }, timeout: 10000 }
        ),
    },
    {
        name: 'queueToday',
        weight: 20,
        run: async (session) => axios.post(
            BASE_URL + 'admin/queue/today',
            { doctorId: pick(session.doctorIds) },
            { headers: { Authorization: `Bearer ${session.token}` }, timeout: 10000 }
        ),
    },
    {
        name: 'addAppointmentV2',
        weight: 20,
        run: async (session) => {
            patientCounter++;
            // Obviously-synthetic patient mobile number — irrelevant anyway
            // since WhatsApp sends are mocked for this test, but kept
            // unambiguously fake regardless.
            const mobilenumber = `7${String(900000000 + patientCounter).padStart(9, '0')}`;
            const startHour = 9 + Math.floor(Math.random() * 8);
            return axios.post(
                BASE_URL + 'admin/addappointmentv2',
                {
                    doctorId: pick(session.doctorIds),
                    hospitalId: session.hospitalId,
                    fullName: `Load Test Patient ${patientCounter}`,
                    mobilenumber,
                    appointmentDate: today,
                    appointmentTime: randomTimeSlot(),
                    startTime: `${String(startHour).padStart(2, '0')}:00`,
                    endTime: `${String(startHour + 1).padStart(2, '0')}:00`,
                    disease: 'Load test',
                },
                { headers: { Authorization: `Bearer ${session.token}` }, timeout: 10000 }
            );
        },
    },
];

const weightedPick = () => {
    const total = actions.reduce((s, a) => s + a.weight, 0);
    let r = Math.random() * total;
    for (const a of actions) {
        if (r < a.weight) return a;
        r -= a.weight;
    }
    return actions[0];
};

const percentile = (sorted, p) => {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    return sorted[idx];
};

const runTier = async (concurrency, durationMs) => {
    const stop = Date.now() + durationMs;
    const latenciesByAction = {};
    const errorsByAction = {};
    for (const a of actions) { latenciesByAction[a.name] = []; errorsByAction[a.name] = 0; }
    let total = 0;

    const worker = async () => {
        while (Date.now() < stop) {
            const session = pick(sessions);
            const action = weightedPick();
            const start = Date.now();
            try {
                await action.run(session);
                latenciesByAction[action.name].push(Date.now() - start);
            } catch (err) {
                errorsByAction[action.name]++;
                latenciesByAction[action.name].push(Date.now() - start);
            }
            total++;
        }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));

    console.log(`\n=== Concurrency ${concurrency} (${durationMs / 1000}s) — ${total} requests, ${(total / (durationMs / 1000)).toFixed(1)} req/s ===`);
    for (const a of actions) {
        const sorted = latenciesByAction[a.name].slice().sort((x, y) => x - y);
        const errs = errorsByAction[a.name];
        console.log(
            `  ${a.name.padEnd(24)} n=${String(sorted.length).padEnd(5)} ` +
            `p50=${percentile(sorted, 0.5)}ms p95=${percentile(sorted, 0.95)}ms p99=${percentile(sorted, 0.99)}ms ` +
            `errors=${errs} (${sorted.length ? ((errs / sorted.length) * 100).toFixed(1) : '0.0'}%)`
        );
    }
};

const run = async () => {
    console.log('Target:', BASE_URL, '| hospitals loaded:', sessions.length);
    for (const concurrency of [20, 50, 100]) {
        await runTier(concurrency, 20000);
    }
};

run().catch((err) => { console.error(err); process.exit(1); });
