const express = require('express');
const router = express.Router();
const reportController = require('../controller/admin/reportController');
const { withHospitalScope } = require('../middleware/scope');

router.use(withHospitalScope({ required: false }));

router.post('/add', withHospitalScope({ required: true }), reportController.addReport);
router.post('/list', withHospitalScope({ required: true }), reportController.getReports);
router.post('/update', reportController.updateReport);

module.exports = router;
