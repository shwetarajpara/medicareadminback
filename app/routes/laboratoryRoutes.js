const express = require('express');
const router = express.Router();
const paramterRoutes = require('./paramterRoutes.js');

router.use('/parameter', paramterRoutes);

module.exports = router;