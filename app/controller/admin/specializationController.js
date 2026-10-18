const SpecializationModel = require('../../model/specialization');
const doctorModel = require('../../model/doctor');
const { successResponse, errorResponse, saveModel, selectdatv2, updateModel, updateModelStrict } = require('../../helper/index');

// Departments are implemented on top of the existing Specialization model
// (collection "specializations") rather than a new concept — a department is
// just a specialization scoped to a hospital. hospitalId unset = a global
// specialization every hospital can use (e.g. "Cardiology"); hospitalId set =
// that hospital's own department.

// A hospital may only touch its own departments, never a global one
// (hospitalId unset) or another hospital's — this matches the admin UI,
// which only renders edit/delete controls when dept.hospitalId is set
// (Departments.jsx). Superadmin (req.isSuperAdmin) is unrestricted.
const findDepartmentScoped = (id, req) => {
    if (req.isSuperAdmin) {
        return SpecializationModel.findOne({ _id: id, delete: false });
    }
    return SpecializationModel.findOne({ _id: id, hospitalId: req.hospitalId, delete: false });
};

const addSpecialization = async (req, res) => {
    try {
        const { name, description, headDoctorId } = req.body;

        if (!name) {
            return errorResponse(res, 'name is required');
        }

        const newSpecialization = await saveModel(SpecializationModel, {
            name,
            description,
            // req.hospitalId is the token's own hospital for a hospital login,
            // or whatever a superadmin supplied (undefined = a global department).
            hospitalId: req.hospitalId || undefined,
            headDoctorId: headDoctorId || undefined,
        });

        return successResponse(res, 'Specialization added successfully', newSpecialization);
    } catch (error) {
        console.error('Error adding specialization:', error);
        return errorResponse(res, 'Error adding specialization');
    }
};

const editSpecialization = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, headDoctorId } = req.body;

        const existing = await findDepartmentScoped(id, req);
        if (!existing) {
            return errorResponse(res, 'Department not found');
        }

        const update = { update: new Date() };
        if (name !== undefined) update.name = name;
        if (description !== undefined) update.description = description;
        if (headDoctorId !== undefined) update.headDoctorId = headDoctorId || undefined;

        const updated = await updateModelStrict(SpecializationModel, { _id: id }, update);
        return successResponse(res, 'Specialization updated successfully', updated);
    } catch (error) {
        console.error('Error updating specialization:', error);
        return errorResponse(res, 'Error updating specialization');
    }
};

const deleteSpecialization = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await findDepartmentScoped(id, req);
        if (!existing) {
            return errorResponse(res, 'Department not found');
        }

        const doctorCount = await doctorModel.countDocuments({ specializationId: id, delete: false });
        if (doctorCount > 0) {
            return errorResponse(res, `Cannot delete — ${doctorCount} doctor(s) are still assigned to this department`);
        }

        await updateModel(SpecializationModel, { _id: id }, { delete: true, update: new Date() });
        return successResponse(res, 'Specialization deleted successfully');
    } catch (error) {
        console.error('Error deleting specialization:', error);
        return errorResponse(res, 'Error deleting specialization');
    }
};

// Hospital-scoped department list: that hospital's own departments plus every
// global (no hospitalId) specialization, each with a doctor count.
const getDepartments = async (req, res) => {
    try {
        const { limit = 50, offset = 0, searchQuery = '' } = req.body;
        const hospitalId = req.hospitalId;

        const condition = {
            delete: false,
            $or: [{ hospitalId }, { hospitalId: { $exists: false } }, { hospitalId: null }]
        };

        const { data: departments, totalRecords } = await selectdatv2(
            SpecializationModel,
            condition,
            '',
            parseInt(limit),
            parseInt(offset),
            'name',
            searchQuery,
            { name: 1 },
            [{ path: 'headDoctorId', select: 'name' }]
        );

        const withCounts = await Promise.all(departments.map(async (dept) => {
            const doctorCount = await doctorModel.countDocuments({ specializationId: dept._id, delete: false });
            return { ...dept.toObject(), doctorCount };
        }));

        return successResponse(res, 'Departments fetched successfully', { departments: withCounts, totalRecords });
    } catch (error) {
        console.error('Error fetching departments:', error);
        return errorResponse(res, 'Error fetching departments');
    }
};

const getDepartmentDoctors = async (req, res) => {
    try {
        const { departmentId } = req.body;

        if (!departmentId) {
            return errorResponse(res, 'departmentId is required');
        }

        // A global department can be shared across hospitals, so only
        // restrict by hospital when the caller actually is one — a
        // superadmin (or a global department itself) sees every doctor
        // assigned to it.
        const condition = { specializationId: departmentId, delete: false };
        if (!req.isSuperAdmin && req.hospitalId) condition.hospitalId = req.hospitalId;

        const doctors = await doctorModel.find(condition)
            .select('name email mobileNumber hospitalId appointmentCharge experience');

        return successResponse(res, 'Department doctors fetched successfully', { doctors });
    } catch (error) {
        console.error('Error fetching department doctors:', error);
        return errorResponse(res, 'Error fetching department doctors');
    }
};

const assignDoctorsToDepartment = async (req, res) => {
    try {
        const { departmentId, doctorIds } = req.body;

        if (!departmentId || !Array.isArray(doctorIds) || doctorIds.length === 0) {
            return errorResponse(res, 'departmentId and a non-empty doctorIds array are required');
        }

        const department = await findDepartmentScoped(departmentId, req);
        if (!department) {
            return errorResponse(res, 'Department not found');
        }

        // A hospital may only reassign its own doctors — otherwise any
        // hospital could pass another hospital's doctorId here and move
        // that doctor under its own department.
        const doctorCondition = { _id: { $in: doctorIds }, delete: false };
        if (!req.isSuperAdmin) doctorCondition.hospitalId = req.hospitalId;

        const matchedCount = await doctorModel.countDocuments(doctorCondition);
        if (matchedCount !== doctorIds.length) {
            return errorResponse(res, 'One or more doctors were not found in this hospital');
        }

        await doctorModel.updateMany(
            doctorCondition,
            { $set: { specializationId: departmentId, update: new Date() } }
        );

        return successResponse(res, 'Doctors assigned to department successfully');
    } catch (error) {
        console.error('Error assigning doctors to department:', error);
        return errorResponse(res, 'Error assigning doctors to department');
    }
};

module.exports = {
    addSpecialization,
    editSpecialization,
    deleteSpecialization,
    getDepartments,
    getDepartmentDoctors,
    assignDoctorsToDepartment,
};
