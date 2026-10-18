    const bcrypt = require('bcryptjs');
const md5 = require('md5');

const SALT_ROUNDS = 10;

// Accounts created before the bcrypt switch still have md5 hex hashes
// (32 hex chars). They're accepted at login and upgraded to bcrypt by the
// caller via isLegacyHash() + hashPassword().
const isLegacyHash = (hash) => typeof hash === 'string' && /^[a-f0-9]{32}$/i.test(hash);

const hashPassword = async (plain) => {
    return bcrypt.hash(plain, SALT_ROUNDS);
};

const comparePassword = async (plain, hash) => {
    if (!hash) return false;
    if (isLegacyHash(hash)) return md5(plain) === hash.toLowerCase();
    return bcrypt.compare(plain, hash);
};

module.exports = { hashPassword, comparePassword, isLegacyHash };
