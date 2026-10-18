const Joi = require('joi');

const objectId = Joi.string().hex().length(24);
const mobile = Joi.string().pattern(/^\d{10}$/).messages({
    'string.pattern.base': 'Mobile number must be 10 digits'
});
const hospitalTypes = ['Multispeciality', 'Speciality', 'Other'];

// Registering a hospital creates its admin login (the hospital document IS
// the hospital-admin account — see adminController.hospitalLogin), so
// email/mobile/password are mandatory here even though addHospital itself
// tolerates them missing. Sent as multipart (profile/images uploads), so
// every field arrives as a string; unknown(true) lets the rest of
// addHospital's fields (address, content, specialization[] …) through.
const registerHospital = Joi.object({
    ownerName: Joi.string().trim().required().messages({ 'string.empty': 'Owner name is required' }),
    name: Joi.string().trim().required().messages({ 'string.empty': 'Hospital name is required' }),
    email: Joi.string().trim().email().required().messages({
        'string.email': 'Valid email is required',
        'string.empty': 'Email is required'
    }),
    mobileNumber: mobile.required(),
    password: Joi.string().min(6).required().messages({
        'string.min': 'Password must be at least 6 characters long',
        'string.empty': 'Password is required'
    }),
    type: Joi.string().valid(...hospitalTypes).required(),
}).unknown(true);

const updateHospital = Joi.object({
    hospitalId: objectId.required(),
    ownerName: Joi.string().trim().optional(),
    name: Joi.string().trim().optional(),
    email: Joi.string().trim().email().optional(),
    mobileNumber: mobile.optional(),
    type: Joi.string().valid(...hospitalTypes).optional(),
    address: Joi.string().allow('').optional(),
    city: Joi.string().allow('').optional(),
    state: Joi.string().allow('').optional(),
    pincode: Joi.string().allow('').optional(),
    latitude: Joi.string().allow('').optional(),
    longitude: Joi.string().allow('').optional(),
    socialMediaLinks: Joi.string().allow('').optional(),
    specialization: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
    otherSpecialization: Joi.string().allow('').optional(),
});

const hospitalId = Joi.object({
    hospitalId: objectId.required(),
});

const setHospitalStatus = Joi.object({
    hospitalId: objectId.required(),
    active: Joi.boolean().required(),
});

const resetHospitalPassword = Joi.object({
    hospitalId: objectId.required(),
    newPassword: Joi.string().min(6).required().messages({
        'string.min': 'Password must be at least 6 characters long',
        'string.empty': 'New password is required'
    }),
});

const pagination = {
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    search: Joi.string().allow('').optional(),
};

const listHospitals = Joi.object({
    ...pagination,
    status: Joi.string().valid('all', 'active', 'inactive').optional(),
    type: Joi.string().valid(...hospitalTypes).optional(),
    city: Joi.string().allow('').optional(),
});

const listAppointments = Joi.object({
    ...pagination,
    hospitalId: objectId.optional(),
    doctorId: objectId.optional(),
    status: Joi.string().valid('Ongoing', 'Booked', 'CheckedIn', 'InConsultation', 'Completed', 'NoShow', 'Cancelled').optional(),
    isEmergency: Joi.boolean().optional(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
});

const appointmentId = Joi.object({
    appointmentId: objectId.required(),
});

const listDoctors = Joi.object({
    ...pagination,
    hospitalId: objectId.optional(),
});

const listPatients = Joi.object({
    ...pagination,
});

const dashboard = Joi.object({
    tzOffsetMinutes: Joi.number().optional(),
});

module.exports = {
    registerHospital,
    updateHospital,
    hospitalId,
    setHospitalStatus,
    resetHospitalPassword,
    listHospitals,
    listAppointments,
    appointmentId,
    listDoctors,
    listPatients,
    dashboard,
};
