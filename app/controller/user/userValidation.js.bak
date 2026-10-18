const Joi = require('joi');

const addEditUser = Joi.object({
    fullName: Joi.string().required().messages({
        'string.empty': 'Full name is required'
    }),
    email: Joi.string().email().required().messages({
        'string.email': 'Valid email is required',
        'string.empty': 'Email is required'
    }),
    password: Joi.string().min(6).required().messages({
        'string.min': 'Password must be at least 6 characters long',
        'string.empty': 'Password is required'
    }),
    mobileNumber: Joi.string().optional(),
    address: Joi.string().optional(),
    dob: Joi.date().optional(),
    gender: Joi.string().valid("MALE", "FEMALE", "OTHER").required(),
    stateId: Joi.string().optional(),
    cityId: Joi.string().optional(),
    zipCode: Joi.string().optional(),
    profile: Joi.string().optional(),
    registerAppVersion: Joi.string().optional(),
    registerOS: Joi.string().optional(),
    registerDevice: Joi.string().optional(),
    userId: Joi.string().optional()
});

const login = Joi.object({
    loginField: Joi.string().required().messages({
        'string.empty': 'Email or mobile number is required'
    }),
    password: Joi.string().required().messages({
        'string.empty': 'Password is required'
    })
});

module.exports = {
    addEditUser,
    login
};