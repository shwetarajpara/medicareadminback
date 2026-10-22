const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const adminController = require('./adminController.js');
const adminValidation = require('./adminValidation.js');
const { validate } = require('../../helper/index.js');
const authenticate = require('../../middleware/auth.js');
const { requireRole } = require('../../middleware/auth.js');
const { storage } = require('../../helper/cloudnary.js');
const ipdRoutes = require('../../routes/ipdRoutes.js');
const reportRoutes = require('../../routes/reportRoutes.js');
const queueRoutes = require('../../routes/queueRoutes.js');
const billingRoutes = require('../../routes/billingRoutes.js');
const laboratoryRoutes = require('../../routes/laboratoryRoutes.js');
const { withHospitalScope } = require('../../middleware/scope.js');

const specializationController = require('./specializationController.js');
const doctorLeaveController = require('./doctorLeaveController.js');
const certificateController = require('./certificateController.js');
const medicineController = require('./medicineController.js');
const patientController = require('./patientController.js');
const dashboardController = require('./dashboardController.js');
const abdmController = require('./abdmController.js');
const abhaController = require('../user/abhaController.js');
const careContextController = require('../user/careContextController.js');

const app = express();
const router = express.Router();


// console.log("__dirname",__dirname);
// const adminProfile = multer.diskStorage({
//     destination: (req, file, cb) => {

//         const uploadPath = path.join(__dirname, '../../../uploads/admin/profiles');
//         if (!fs.existsSync(uploadPath)) {
//             fs.mkdirSync(uploadPath, { recursive: true });
//         }
//         cb(null, uploadPath);
//     },
//     filename: (req, file, cb) => {
//         const ext = path.extname(file.originalname);
//         cb(null, `${Date.now()}${ext}`);
//     }
// });

// const uploadProfile = multer({ storage: adminProfile });

const uploadProfile = multer({ storage });

// For parsing an uploaded .docx into HTML server-side (certificate template
// authoring) — needs the raw buffer, so it can't go through the Cloudinary
// storage engine above (that uploads straight to Cloudinary with no buffer
// handed back, and only allows jpg/png/jpeg/pdf anyway). The original file
// is never persisted; only the extracted text is kept.
const uploadDocToMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Apply global middleware
router.use(express.json()); // Parses JSON requests

// --- Public routes (no auth required) ---
router.get('/test', adminController.test);
router.post('/login', validate(adminValidation.login), adminController.login);
router.post('/hospitallogin', validate(adminValidation.login), adminController.hospitalLogin);
router.post('/signin', validate(adminValidation.login), adminController.signin); // single panel login: hospital or superadmin
router.post('/gethospitals', adminController.getHospitals); // public hospital browsing (used by patient-facing search too)

// Forgot password (superadmin + hospital) — OTP sent via ShreeSMS to the
// mobile number on file. Must stay public: a locked-out admin has no token.
router.post('/forgotpassword/sendotp', validate(adminValidation.forgotPasswordSendOtp), adminController.forgotPasswordSendOtp);
router.post('/forgotpassword/verifyotp', validate(adminValidation.forgotPasswordVerifyOtp), adminController.forgotPasswordVerifyOtp);
router.post('/forgotpassword/resetpassword', validate(adminValidation.resetPassword), adminController.resetPassword);

// --- Everything below requires a valid token ---
router.use(authenticate);

// Staff-only gate (hospital or superadmin) — applied below to modules built
// this session, plus the appointment read/write routes (confirmed to have
// no callers outside this admin repo). Some pre-existing routes are still
// deliberately left ungated: the live patient app isn't in this repo, so we
// can't confirm what it calls, and a patient's role:'user' token could reach
// any route here that isn't explicitly gated (see security-hardening plan).
const staff = requireRole('admin', 'hospital');

router.post('/addeditadmin', requireRole('admin'), uploadProfile.single('profile'), validate(adminValidation.addEditAdmin), adminController.addEditAdmin);
router.post('/adminprofile', adminController.adminProfile);
router.post('/myprofile', staff, adminController.myProfile);

router.post('/addhospital', requireRole('admin'), uploadProfile.fields([{ name: 'profile' }, { name: 'images' }]), adminController.addHospital); // corrected the route to lowercase

// Gated staff + withHospitalScope: these five used to trust a
// client-supplied hospitalId from the request body instead of deriving it
// from the token, meaning a hospital login (or anyone with a valid staff
// token) could read or write another hospital's appointments by simply
// changing the body/query. withHospitalScope forces req.hospitalId from the
// token for role 'hospital'; the controllers now prefer req.hospitalId over
// any client-supplied value (falling back to it only for superadmin).
router.post('/getSlotsDetails', staff, withHospitalScope({ required: false }), adminController.getSlotsDetails);
router.post('/addappointment', staff, withHospitalScope({ required: false }), adminController.addAppointment);
router.post('/addappointmentv2', staff, withHospitalScope({ required: false }), adminController.addAppointmentV2);
// Left reachable by any authenticated role (patient tokens plausibly cancel
// their own booking here) — ownership is enforced inside deleteAppointment
// itself instead of a role gate: hospital tokens can only delete their own
// hospital's appointments, patient tokens only their own bookings.
router.post('/deleteappointment', withHospitalScope({ required: false }), adminController.deleteAppointment);
// Non-destructive cancellation (status:'Cancelled', stays visible, frees
// the slot) — same reachability as deleteappointment above: a patient may
// cancel their own booking, ownership enforced inside the controller.
router.post('/cancelappointment', withHospitalScope({ required: false }), adminController.cancelAppointment);
router.post('/getappointmentswithdetails', staff, withHospitalScope({ required: false }), adminController.getAppointmentsWithDetails); // corrected the route to lowercase
router.post('/getappointmentsdata', staff, withHospitalScope({ required: false }), adminController.getAppointmentsData); // corrected the route to lowercase
// Patients list (visits grouped by mobile number), paginated server-side.
router.post('/patients/list', staff, withHospitalScope({ required: false }), patientController.getPatients);
router.post('/patients/records', staff, withHospitalScope({ required: false }), patientController.getPatientRecords);
// Dashboard numbers computed server-side (was: download everything, compute in browser).
router.post('/dashboard/stats', staff, withHospitalScope({ required: false }), dashboardController.getDashboardStats);

router.post('/sendLabReportWhatsapp', adminController.sendLabReportToWhatsApp);

router.post('/addeditsetting', adminController.addeditSetting); // corrected the route to lowercase
router.post('/getsettings', adminController.getSettings); // corrected the route to lowercase
router.post('/updateappointmenttimebytype', adminController.updateAppointmentTimeByType); // corrected the route to lowercase
router.post('/editappointmentdetails', adminController.editAppointmentDetails); // corrected the route to lowercase
router.patch('/editAppointmentDetailsV2', uploadProfile.single('labReportFile'), validate(adminValidation.editAppointmentDetails), adminController.editAppointmentDetailsV2); // corrected the route to lowercase
// Autocomplete for the prescription form: medicines this patient was given before.
router.post('/patientMedicines', staff, withHospitalScope({ required: false }), medicineController.getPatientMedicines);

router.post('/adddoctor', staff, withHospitalScope({ required: false }), adminController.addDoctor);
router.post('/updatedoctor', staff, withHospitalScope({ required: false }), adminController.updateDoctor);
router.post('/getdoctors', adminController.getDoctors);
// Not called by either admin frontend and returns every patient system-wide
// with no sensible hospital scoping (patients aren't tied to one hospital) —
// superadmin only.
router.post('/getuserlist', requireRole('admin'), adminController.getUserList);

router.post('/checkoutDoctorUpdate', staff, withHospitalScope({ required: false }), adminController.checkoutDoctorUpdate);
router.post('/doctorUpdateAvailable', staff, withHospitalScope({ required: false }), adminController.doctorUpdateAvailable);

// Doctor leave/holiday calendar — date-specific overrides on top of a
// doctor's recurring weekly workingHours (see app/model/doctorLeave.js).
router.post('/doctor/leave/add', staff, withHospitalScope({ required: false }), doctorLeaveController.addDoctorLeave);
router.post('/doctor/leave/list', staff, withHospitalScope({ required: false }), doctorLeaveController.getDoctorLeaves);
router.post('/doctor/leave/delete/:id', staff, withHospitalScope({ required: false }), doctorLeaveController.deleteDoctorLeave);
// Feeds the red/available month calendar in the booking UI.
router.post('/doctor/monthAvailability', staff, withHospitalScope({ required: false }), doctorLeaveController.getMonthAvailability);

router.post('/imageUpload', uploadProfile.fields([{ name: 'images' }]), adminController.imageUpload);

router.post('/bannerSave', uploadProfile.fields([{ name: 'images' }]), adminController.addEditBanner);
router.post('/bannerView', adminController.bannerView);

router.post("/getAllSpecializations", adminController.getAllSpecializations);
router.post("/addSpecialization", staff, withHospitalScope({ required: false }), specializationController.addSpecialization);
router.post("/editSpecialization/:id", staff, withHospitalScope({ required: false }), specializationController.editSpecialization);
router.post("/deleteSpecialization/:id", staff, withHospitalScope({ required: false }), specializationController.deleteSpecialization);

// Department management (built on the specialization model — see specializationController.js)
router.post("/department/list", staff, withHospitalScope({ required: true }), specializationController.getDepartments);
router.post("/department/doctors", staff, withHospitalScope({ required: false }), specializationController.getDepartmentDoctors);
router.post("/department/assignDoctors", staff, withHospitalScope({ required: false }), specializationController.assignDoctorsToDepartment);

router.use('/ipd', staff, ipdRoutes);
router.use('/report', staff, reportRoutes);
router.use('/queue', staff, queueRoutes);
router.use('/billing', staff, billingRoutes);
router.use('/laboratory', staff, withHospitalScope({ required: false }), laboratoryRoutes);

// Certificate management.
// NOTE: was previously ungated (no `staff`/withHospitalScope) — req.hospitalId
// was never set, so scopeFilter() inside getTemplates ran unscoped. Fixed
// below alongside adding the DB-backed template CRUD it now reads from.
router.get('/certificate/templates', staff, withHospitalScope({ required: true }), certificateController.getTemplates);
router.post('/certificate/add', staff, withHospitalScope({ required: true }), certificateController.createCertificate);
router.post('/certificate/list', staff, withHospitalScope({ required: true }), certificateController.getCertificates);
router.post('/certificate/detail', staff, withHospitalScope({ required: false }), certificateController.getCertificateById);
router.post('/certificate/edit/:id', staff, withHospitalScope({ required: false }), certificateController.editCertificate);
// Fills the real .docx and converts it to PDF server-side (LibreOffice) —
// true formatting fidelity, not a browser screenshot. /preview streams the
// PDF back without saving anything; /issue does the same fill+convert then
// uploads and marks the certificate Issued.
router.post('/certificate/preview', staff, withHospitalScope({ required: true }), certificateController.renderCertificatePreview);
router.post('/certificate/issue', staff, withHospitalScope({ required: false }), certificateController.issueCertificate);
router.post('/certificate/delete/:id', staff, withHospitalScope({ required: false }), certificateController.deleteCertificate);

// Per-certificate manual editing round-trip: download the filled .docx,
// edit it in Word, upload it back — Preview/Issue then render that file
// directly instead of re-filling the template (see certificateController.js).
router.post('/certificate/downloadEditable', staff, withHospitalScope({ required: false }), certificateController.downloadEditableCopy);
router.post('/certificate/uploadOverride', staff, withHospitalScope({ required: false }), uploadDocToMemory.single('file'), certificateController.uploadOverrideDocx);
router.post('/certificate/discardOverride', staff, withHospitalScope({ required: false }), certificateController.discardOverrideDocx);

// Certificate template management (Settings → Certificate Templates). The
// uploaded .docx is stored as-is and IS the template — see
// certificateController.js for why (true fidelity vs. an HTML re-render).
router.post('/certificate/template/add', staff, withHospitalScope({ required: true }), uploadDocToMemory.single('file'), certificateController.addTemplate);
router.post('/certificate/template/edit/:id', staff, withHospitalScope({ required: false }), uploadDocToMemory.single('file'), certificateController.editTemplate);
router.post('/certificate/template/delete/:id', staff, withHospitalScope({ required: false }), certificateController.deleteTemplate);

// ABDM/ABHA — hospital-level opt-in toggle (D1 foundation only; M1/M2/M3
// patient-facing endpoints land in later phases once sandbox credentials exist)
router.post('/abdm/settings/get', abdmController.getAbdmSettings);
router.post('/abdm/settings/update', abdmController.updateAbdmSettings);

// ABHA (M1) — create/link a patient's health ID. Inert (clear error, not a
// crash) until ABDM_CLIENT_ID/SECRET are configured; see memory note.
router.post('/abha/requestAadhaarOtp', abhaController.requestAadhaarOtp);
router.post('/abha/verifyAadhaarOtp', abhaController.verifyAadhaarOtpAndEnrol);
router.post('/abha/linkExisting', abhaController.linkExistingAbha);
router.post('/abha/unlink', abhaController.unlinkAbha);
router.post('/abha/login/requestOtp', abhaController.requestLoginOtp);
router.post('/abha/login/verifyOtp', abhaController.verifyLoginOtp);
router.post('/abha/login/selectAccount', abhaController.selectAbhaAccount);

// Care Context Linking (M2, lightweight — metadata only, no clinical data)
router.post('/abha/careContext/link', careContextController.linkCareContext);

module.exports = router;

// Added 
// billing, certificate, doctorLeave, queue, report -- admin controller
