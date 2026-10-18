// Family member management — a patient's logged-in account can add
// dependents (spouse, children, parents, etc.) who don't need their own
// login. They're ordinary `user` documents (see app/model/user.js's
// `managedBy` field), so every existing userId-keyed system — appointments,
// bills, certificates, IPD — already works for them unchanged.
const userModel = require('../../model/user');
const { successResponse, errorResponse, saveModel, updateModelStrict } = require('../../helper/index');

const addFamilyMember = async (req, res) => {
    try {
        const { fullName, relation, dob, gender, address } = req.body;
        if (!fullName) {
            return errorResponse(res, 'fullName is required');
        }

        const member = await saveModel(userModel, {
            fullName,
            relation: relation || 'Other',
            dob,
            gender,
            address,
            managedBy: req.auth.id,
        });

        return successResponse(res, 'Family member added successfully', member);
    } catch (error) {
        console.error('Error adding family member:', error);
        return errorResponse(res, 'Error adding family member');
    }
};

const getFamilyMembers = async (req, res) => {
    try {
        const members = await userModel.find({ managedBy: req.auth.id, delete: false }).sort({ create: 1 });
        return successResponse(res, 'Family members fetched successfully', members);
    } catch (error) {
        console.error('Error fetching family members:', error);
        return errorResponse(res, 'Error fetching family members');
    }
};

const editFamilyMember = async (req, res) => {
    try {
        const { memberId, fullName, relation, dob, gender, address } = req.body;
        if (!memberId) {
            return errorResponse(res, 'memberId is required');
        }

        const existing = await userModel.findOne({ _id: memberId, managedBy: req.auth.id, delete: false });
        if (!existing) {
            return errorResponse(res, 'Family member not found');
        }

        const update = { update: new Date() };
        if (fullName !== undefined) update.fullName = fullName;
        if (relation !== undefined) update.relation = relation;
        if (dob !== undefined) update.dob = dob;
        if (gender !== undefined) update.gender = gender;
        if (address !== undefined) update.address = address;

        const updated = await updateModelStrict(userModel, { _id: memberId }, update);
        return successResponse(res, 'Family member updated successfully', updated);
    } catch (error) {
        console.error('Error updating family member:', error);
        return errorResponse(res, 'Error updating family member');
    }
};

const deleteFamilyMember = async (req, res) => {
    try {
        const { memberId } = req.body;
        if (!memberId) {
            return errorResponse(res, 'memberId is required');
        }

        const existing = await userModel.findOne({ _id: memberId, managedBy: req.auth.id, delete: false });
        if (!existing) {
            return errorResponse(res, 'Family member not found');
        }

        await updateModelStrict(userModel, { _id: memberId }, { delete: true, update: new Date() });
        return successResponse(res, 'Family member removed successfully');
    } catch (error) {
        console.error('Error removing family member:', error);
        return errorResponse(res, 'Error removing family member');
    }
};

module.exports = { addFamilyMember, getFamilyMembers, editFamilyMember, deleteFamilyMember };
