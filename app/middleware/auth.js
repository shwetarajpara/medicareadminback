const { verifyToken } = require('../helper/jwt');

// Verifies a token if one is present, but never rejects when it's absent —
// for routes that must stay reachable pre-login (e.g. account creation
// during registration) while still being able to enforce ownership checks
// when a caller *does* send a token (e.g. editing an existing account).
const optionalAuthenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
        try {
            req.auth = verifyToken(token);
        } catch (error) {
            // Invalid/expired token on an optional-auth route — proceed
            // unauthenticated rather than failing the request; any
            // ownership check downstream will correctly reject edits.
        }
    }
    next();
};

const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token) {
            return res.status(401).json({ status: 401, message: 'Authorization token is missing' });
        }

        const decoded = verifyToken(token);
        req.auth = decoded; // { id, role }
        next();
    } catch (error) {
        return res.status(401).json({ status: 401, message: 'Invalid or expired token' });
    }
};

// Restricts to specific roles, e.g. requireRole('admin'), requireRole('admin', 'hospital')
const requireRole = (...roles) => (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
        return res.status(403).json({ status: 403, message: 'Forbidden for this role' });
    }
    next();
};

module.exports = authenticate;
module.exports.requireRole = requireRole;
module.exports.optionalAuthenticate = optionalAuthenticate;
