const express = require('express');
const multer = require('multer');
const router = express.Router();
const ipdController = require("../controller/admin/ipdController");
const { withHospitalScope } = require('../middleware/scope');
const { storage } = require('../helper/cloudnary');

const uploadLabReport = multer({ storage });

// Populates req.hospitalId from the token for every route below (hospital
// role always resolves it; the existing frontend doesn't send hospitalId at
// all, so this is the only way these routes get scoped).
router.use(withHospitalScope({ required: false }));

router.post('/moveToIpd', ipdController.moveToIpd);

// Get all IPD patients with pagination and filtering
router.get('/patients', ipdController.getAllIpdPatients);

router.get('/getAllIpd', ipdController.getAllIpd)

router.get('/getAllDischargedIpd', ipdController.getAllDischargedIpd);

// Get single IPD patient details
router.get('/patients/:ipdId', ipdController.getIpdPatientById);

// Update IPD patient information
router.put('/patients/:ipdId', ipdController.updateIpdPatient);

// Discharge IPD patient
router.post('/patients/:ipdId/discharge', ipdController.dischargeIpdPatient);

router.get('/getAllIpdInstructions/:ipdId', ipdController.getAllIpdInstructions);
router.post('/addInstructions', uploadLabReport.single('labReportFile'), ipdController.addIpdInstructionByDoctor);
router.get('/getIpdDetails/:ipdId', ipdController.getIpdDetails);
router.post('/dischargePatient', ipdController.dischargePatient);
module.exports = router;