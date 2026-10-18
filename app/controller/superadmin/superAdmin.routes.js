const express = require('express');
const multer = require('multer');
const superAdminController = require('./superAdminController.js');
const superAdminValidation = require('./superAdminValidation.js');
const adminController = require('../admin/adminController.js');
const { validate } = require('../../helper/index.js');
const authenticate = require('../../middleware/auth.js');
const { requireRole } = require('../../middleware/auth.js');
const { storage } = require('../../helper/cloudnary.js');

const router = express.Router();
const upload = multer({ storage });

// Superadmin panel API — mounted at /medicare/superadmin. Superadmin accounts
// log in through the existing /medicare/admin/signin (or /admin/login),
// which issues a token with role 'admin'. Every route below requires it.
router.use(authenticate, requireRole('admin'));

// Platform overview
router.post('/dashboard', validate(superAdminValidation.dashboard), superAdminController.getDashboard);

// Hospitals (each hospital document is also that hospital admin's login)
router.post('/hospitals/list', validate(superAdminValidation.listHospitals), superAdminController.listHospitals);
router.post('/hospitals/detail', validate(superAdminValidation.hospitalId), superAdminController.getHospitalDetail);
// multipart: profile (1 file), images (gallery) + hospital fields. Creation
// itself is the existing addHospital — this route adds required-field
// validation and cross-account email/mobile uniqueness in front of it.
router.post(
    '/hospitals/register',
    upload.fields([{ name: 'profile', maxCount: 1 }, { name: 'images' }]),
    validate(superAdminValidation.registerHospital),
    superAdminController.ensureUniqueHospitalLogin,
    adminController.addHospital
);
router.post('/hospitals/update', upload.single('profile'), validate(superAdminValidation.updateHospital), superAdminController.updateHospital);
router.post('/hospitals/status', validate(superAdminValidation.setHospitalStatus), superAdminController.setHospitalStatus);
router.post('/hospitals/resetpassword', validate(superAdminValidation.resetHospitalPassword), superAdminController.resetHospitalPassword);

// Appointments across all hospitals
router.post('/appointments/list', validate(superAdminValidation.listAppointments), superAdminController.listAppointments);
router.post('/appointments/detail', validate(superAdminValidation.appointmentId), superAdminController.getAppointmentDetail);

// Doctors and patients across all hospitals
router.post('/doctors/list', validate(superAdminValidation.listDoctors), superAdminController.listDoctors);
router.post('/patients/list', validate(superAdminValidation.listPatients), superAdminController.listPatients);

module.exports = router;
