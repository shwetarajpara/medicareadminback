// helper/hospitalCode.js
//
// Generates the short, unique hospital abbreviation used in certificate
// numbers (CRT<certCode><YYYYMMDD><seq>), e.g. "City Care Hospital" -> "CCH".
const hospitalModel = require('../model/hospital');

const deriveAbbreviation = (name) => {
    const words = String(name || '')
        .toUpperCase()
        .replace(/[^A-Z\s]/g, '')
        .split(/\s+/)
        .filter(Boolean);

    if (words.length >= 3) return words.slice(0, 3).map((w) => w[0]).join('');
    if (words.length === 2) return (words[0][0] + words[1].slice(0, 2)).padEnd(3, 'X');
    if (words.length === 1) return words[0].slice(0, 3).padEnd(3, 'X');
    return 'HSP';
};

// Tries the natural abbreviation first, then disambiguates by swapping the
// last character — digits 1-9, then letters A-Z, then (practically
// unreachable) a random 2-char suffix — until an unused code is found.
const generateUniqueHospitalCode = async (name) => {
    const base = deriveAbbreviation(name).slice(0, 3).padEnd(3, 'X');
    let candidate = base;
    let attempt = 0;

    while (await hospitalModel.exists({ certCode: candidate })) {
        attempt += 1;
        if (attempt <= 9) {
            candidate = base.slice(0, 2) + attempt;
        } else if (attempt <= 35) {
            candidate = base.slice(0, 2) + String.fromCharCode(65 + (attempt - 10)); // A, B, C...
        } else {
            candidate = base.slice(0, 1) + Math.random().toString(36).slice(2, 4).toUpperCase();
        }
    }
    return candidate;
};

// Hospitals onboarded before this feature existed won't have a certCode —
// generate and persist one the first time it's needed, instead of failing.
const getOrCreateHospitalCode = async (hospitalId) => {
    const hospital = await hospitalModel.findById(hospitalId).select('certCode name');
    if (!hospital) {
        throw new Error('Hospital not found');
    }
    if (hospital.certCode) {
        return hospital.certCode;
    }
    const code = await generateUniqueHospitalCode(hospital.name);
    await hospitalModel.updateOne({ _id: hospitalId }, { certCode: code });
    return code;
};

module.exports = { generateUniqueHospitalCode, getOrCreateHospitalCode };
