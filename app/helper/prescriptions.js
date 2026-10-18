// Structured prescription rows, as sent by the admin consultation form
// (IPD rounds and OPD appointment details). Over multipart/form-data the
// array arrives as a JSON string, over JSON as a real array — accept both,
// and keep only known keys so arbitrary input can't be stored.
const TIMINGS = ['morning', 'afternoon', 'evening', 'night'];

const parsePrescriptions = (raw) => {
    if (raw === undefined || raw === null || raw === '') return undefined;

    let list = raw;
    if (typeof raw === 'string') {
        try {
            list = JSON.parse(raw);
        } catch {
            return undefined;
        }
    }
    if (!Array.isArray(list)) return undefined;

    return list
        .map((p) => ({
            medicineName: String(p?.medicineName || '').trim(),
            timing: Array.isArray(p?.timing) ? p.timing.filter((t) => TIMINGS.includes(t)) : [],
            mealInstruction: ['before', 'after'].includes(p?.mealInstruction) ? p.mealInstruction : '',
            days: p?.days === undefined || p?.days === null ? '' : String(p.days),
        }))
        .filter((p) => p.medicineName);
};

// Plain-text version for readers that only know the old free-text
// prescriptionList field.
const summarizePrescriptions = (list) =>
    (list || [])
        .map((p) => {
            const parts = [p.medicineName];
            if (p.timing.length) parts.push(p.timing.join('/'));
            if (p.mealInstruction) parts.push(`${p.mealInstruction} meal`);
            if (p.days) parts.push(`${p.days} days`);
            return parts.join(' - ');
        })
        .join('\n');

module.exports = { parsePrescriptions, summarizePrescriptions };
