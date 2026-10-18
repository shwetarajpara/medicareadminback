// The one place "who can this logged-in patient act as" gets computed —
// every patient-facing endpoint that books, cancels, or reads history uses
// this instead of re-deriving the owned-id set itself. Family members are
// ordinary `user` documents with `managedBy` pointing at the primary,
// login-capable account (see app/model/user.js).
const userModel = require('../model/user');

// Returns [self, ...owned family member ids] as strings, for the currently
// authenticated patient (req.auth.id — a 'user'-role JWT, see
// app/middleware/auth.js). Never trusts anything from the request body.
const getOwnedUserIds = async (req) => {
    const selfId = String(req.auth.id);
    const familyMembers = await userModel.find({ managedBy: selfId, delete: false }).select('_id');
    return [selfId, ...familyMembers.map((m) => String(m._id))];
};

module.exports = { getOwnedUserIds };
