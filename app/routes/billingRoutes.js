const express = require('express');
const router = express.Router();
const billingController = require('../controller/admin/billingController');
const { withHospitalScope } = require('../middleware/scope');

// Populates req.hospitalId for every route below (from the token for
// hospital-role callers, from the body for superadmin) without blocking —
// individual routes then opt into requiring it where that's safe to enforce.
router.use(withHospitalScope({ required: false }));

router.post('/charges/add', withHospitalScope({ required: true }), billingController.addCharge);
router.post('/charges/list', withHospitalScope({ required: true }), billingController.getCharges);
router.post('/charges/edit/:id', billingController.editCharge);
router.post('/charges/delete/:id', billingController.deleteCharge);

router.post('/add', withHospitalScope({ required: true }), billingController.createBill);
router.post('/list', withHospitalScope({ required: true }), billingController.getBills);
router.post('/detail', billingController.getBillById);
router.post('/edit', billingController.updateBill);
router.post('/recordPayment', billingController.recordPayment);
router.post('/paymentLink/generate', billingController.generatePaymentLink);
router.post('/paymentLink/send', billingController.sendPaymentLink);
router.post('/paymentLink/verify', billingController.verifyPaymentLink);
router.post('/history', withHospitalScope({ required: true }), billingController.getBillingHistory);

module.exports = router;
