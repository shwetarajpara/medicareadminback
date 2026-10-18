const { errorResponse } = require('../helper/index');

// Derives the hospitalId a request is allowed to act as, from the token
// rather than trusting the request body. Hospital-role tokens carry the
// hospital's own _id as `req.auth.id` (see adminController.js login) — for
// those we ignore any hospitalId the client sent, so a hospital can never
// impersonate another hospital by editing the request body. Superadmin
// (role 'admin') may act on behalf of any hospital named in the body.
const resolveHospitalId = (req) => {
    const role = req.auth?.role;
    if (role === 'hospital') {
        return { hospitalId: String(req.auth.id), isSuperAdmin: false };
    }
    if (role === 'admin') {
        return { hospitalId: req.body?.hospitalId || null, isSuperAdmin: true };
    }
    return { hospitalId: null, isSuperAdmin: false };
};

// Middleware: sets req.hospitalId / req.isSuperAdmin. When required and no
// hospitalId could be resolved (e.g. superadmin omitted it), rejects rather
// than silently returning every tenant's data.
const withHospitalScope = ({ required = true } = {}) => (req, res, next) => {
    const { hospitalId, isSuperAdmin } = resolveHospitalId(req);
    req.hospitalId = hospitalId;
    req.isSuperAdmin = isSuperAdmin;

    if (required && !hospitalId) {
        return errorResponse(res, 'hospitalId is required');
    }
    next();
};

// Merges the resolved hospitalId into a query condition. A superadmin with
// no hospitalId resolved (req.hospitalId null) is left unscoped on purpose —
// only reachable on routes that didn't require scope in the first place.
const scopeFilter = (req, extra = {}) => {
    if (!req.hospitalId) return { ...extra };
    return { ...extra, hospitalId: req.hospitalId };
};

const findScoped = (Model, id, req, extraCondition = {}) =>
    Model.findOne(scopeFilter(req, { _id: id, delete: false, ...extraCondition }));

// Optional department narrowing, additive on top of scopeFilter's hospital
// scoping. A record with no departmentId (pre-department-feature data, or a
// doctor with no department) matches every department filter — never
// strict equality — so old records never appear to vanish. Only applied
// when the caller actually supplied a departmentId; absent one, behavior
// is unchanged.
const departmentFilter = (req, extra = {}) => {
    const departmentId = req.body?.departmentId || req.query?.departmentId;
    if (!departmentId) return extra;
    return {
        ...extra,
        $or: [{ departmentId }, { departmentId: { $exists: false } }, { departmentId: null }]
    };
};

module.exports = { resolveHospitalId, withHospitalScope, scopeFilter, findScoped, departmentFilter };
