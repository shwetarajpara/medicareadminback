const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Define the register route
router.use('/admin', require('./../controller/admin/admin.routes'));
router.use('/user', require('./../controller/user/user.routes'));
router.use('/superadmin', require('./../controller/superadmin/superAdmin.routes'));

module.exports = router;