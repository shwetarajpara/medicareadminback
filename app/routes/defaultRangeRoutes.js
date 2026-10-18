const express = require('express');
const defaultParameterRangeController = require('../controller/laboratory/defaultParameterRangeController');
const router = express.Router();

router.get('/:parameterId', defaultParameterRangeController.getAllParameterRangesByParameterId);
router.get('/:parameterId/:parameterRangeId', defaultParameterRangeController.getSingleParameterRange);
router.post('/add', defaultParameterRangeController.addDefaultParameterRange);
router.put('/:parameterRangeId', defaultParameterRangeController.updateDefaultParameterRange);
router.delete('/:parameterRangeId', defaultParameterRangeController.deleteParameterRange);

module.exports = router;