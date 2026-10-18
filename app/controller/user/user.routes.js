const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('./userController.js');
const familyController = require('./familyController.js');
const userAppointmentController = require('./userAppointmentController.js');
const userHistoryController = require('./userHistoryController.js');
const validation = require('./userValidation.js');
const { validate } = require('../../helper/index.js');
const authenticate = require('../../middleware/auth.js');
const { optionalAuthenticate, requireRole } = require('../../middleware/auth.js');

const app = express();
const router = express.Router();


const userProfile = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads/user/profiles');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}${ext}`);
    }
});

const uploadProfile = multer({ storage: userProfile });

// Apply global middleware
router.use(express.json()); // Parses JSON requests

// --- Public routes (no auth required — registration/login/browsing) ---
// addedituser must stay reachable without a token for brand-new account
// creation (called right after OTP verification, before any token exists).
// Editing an EXISTING account (userId present) now requires ownership,
// enforced in addEditUser itself via req.auth — populated here only if a
// token was actually sent, never required.
router.post('/addedituser', optionalAuthenticate, uploadProfile.single('profile'), validate(validation.addEditUser), controller.addEditUser);
router.post('/login', controller.login);
router.post('/registerationOtp', controller.registrationOtp);
router.post('/verifyotp', controller.verifyOtp);
router.post("/searchDoctorsAndHospitalsByName", controller.searchDoctorsAndHospitalsByName);

// --- Everything below requires a valid token ---
router.use(authenticate);

router.post('/userprofile', controller.userProfile);

// Mobile app: a patient's own certificates only — see userController.js for
// how this is scoped (userId or own mobile number, resolved from the token,
// never from the request body).
router.post('/certificates/list', requireRole('user'), controller.getMyCertificates);
router.post('/certificates/detail', requireRole('user'), controller.getMyCertificateDetail);

// Family members — dependents managed under this account, not needing
// their own login (see app/model/user.js's managedBy field).
router.post('/family/add', requireRole('user'), familyController.addFamilyMember);
router.post('/family/list', requireRole('user'), familyController.getFamilyMembers);
router.post('/family/edit', requireRole('user'), familyController.editFamilyMember);
router.post('/family/delete', requireRole('user'), familyController.deleteFamilyMember);

// Self-service booking — for the account itself or a managed family member.
router.post('/appointments/slots', requireRole('user'), userAppointmentController.getAvailableSlots);
router.post('/appointments/book', requireRole('user'), userAppointmentController.bookAppointment);
// Cancelling a booking is handled by the existing shared endpoint,
// POST /medicare/admin/cancelappointment — already reachable by a patient
// token and ownership-checked against this same account + its family
// members (see adminController.cancelAppointment).

// Medical history — appointments (with prescriptions), IPD admissions/
// rounds, and bills, across every hospital, for this account and its
// managed family members.
router.post('/history/appointments', requireRole('user'), userHistoryController.getMyAppointments);
router.post('/history/ipd', requireRole('user'), userHistoryController.getMyIpdHistory);
router.post('/history/ipd/instructions', requireRole('user'), userHistoryController.getMyIpdInstructions);
router.post('/history/bills', requireRole('user'), userHistoryController.getMyBills);

module.exports = router;