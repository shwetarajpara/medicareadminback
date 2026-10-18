const express = require('express');
const hospitalCustomParameterRangeController = require('../controller/laboratory/hospitalCustomParameterRangeController');
const router = express.Router();

router.get('/:hospitalId/:parameterId', hospitalCustomParameterRangeController.getHospitalParameterRangesByParameterId);
router.post('/add', hospitalCustomParameterRangeController.addHospitalParameterRange);
router.put('/:parameterRangeId', hospitalCustomParameterRangeController.updateHospitalParameterRange);
router.delete('/:parameterRangeId', hospitalCustomParameterRangeController.deleteHospitalParameterRange);

module.exports = router;