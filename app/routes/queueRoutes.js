const express = require('express');
const router = express.Router();
const queueController = require('../controller/admin/queueController');
const { withHospitalScope } = require('../middleware/scope');

// Required:false — the frontend doesn't currently send hospitalId on these
// calls (it's derived from the doctor instead, see queueController's
// assertDoctorInHospital), but every handler needs req.hospitalId populated
// from the token when the caller is hospital-scoped, so this runs for all of them.
router.use(withHospitalScope({ required: false }));

router.post('/today', queueController.getTodayQueue);
router.post('/status', queueController.getQueueStatus);
router.post('/checkin', queueController.checkInPatient);
router.post('/callNext', queueController.callNextPatient);
router.post('/startConsultation', queueController.startConsultation);
router.post('/complete', queueController.completeConsultation);
router.post('/priority', queueController.setQueuePriority);
router.post('/noShow', queueController.markNoShow);

module.exports = router;
