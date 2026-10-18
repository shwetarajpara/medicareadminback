const moment = require('moment');
const chargeMasterModel = require('../../model/chargeMaster');
const billModel = require('../../model/bill');
const billCounterModel = require('../../model/billCounter');
const { successResponse, errorResponse, saveModel, selectdatv2, updateModel, updateModelStrict } = require('../../helper/index');
const { createUpiLink } = require('../../helper/paymentLinkService');
const { scopeFilter, findScoped } = require('../../middleware/scope');
const { getOrCreateHospitalCode } = require('../../helper/hospitalCode');

// ---- Charge Master ----

const addCharge = async (req, res) => {
    try {
        const { name, category, amount } = req.body;
        if (!name || amount === undefined) {
            return errorResponse(res, 'name and amount are required');
        }

        const newCharge = await saveModel(chargeMasterModel, { hospitalId: req.hospitalId, name, category, amount });
        return successResponse(res, 'Charge added successfully', newCharge);
    } catch (error) {
        console.error('Error adding charge:', error);
        return errorResponse(res, 'Error adding charge');
    }
};

const getCharges = async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.body;
        const condition = scopeFilter(req, { delete: false, isActive: true });

        const { data: charges, totalRecords } = await selectdatv2(
            chargeMasterModel, condition, '', parseInt(limit), parseInt(offset), '', '', { category: 1, name: 1 }
        );

        return successResponse(res, 'Charges fetched successfully', { charges, totalRecords });
    } catch (error) {
        console.error('Error fetching charges:', error);
        return errorResponse(res, 'Error fetching charges');
    }
};

const editCharge = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, amount, isActive } = req.body;

        const existing = await findScoped(chargeMasterModel, id, req);
        if (!existing) {
            return errorResponse(res, 'Charge not found');
        }

        const update = { update: new Date() };
        if (name !== undefined) update.name = name;
        if (category !== undefined) update.category = category;
        if (amount !== undefined) update.amount = amount;
        if (isActive !== undefined) update.isActive = isActive;

        const updated = await updateModelStrict(chargeMasterModel, { _id: id }, update);
        return successResponse(res, 'Charge updated successfully', updated);
    } catch (error) {
        console.error('Error updating charge:', error);
        return errorResponse(res, 'Error updating charge');
    }
};

const deleteCharge = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await findScoped(chargeMasterModel, id, req);
        if (!existing) {
            return errorResponse(res, 'Charge not found');
        }

        await updateModel(chargeMasterModel, { _id: id }, { delete: true, update: new Date() });
        return successResponse(res, 'Charge deleted successfully');
    } catch (error) {
        console.error('Error deleting charge:', error);
        return errorResponse(res, 'Error deleting charge');
    }
};

// ---- Bills ----

// INV<hospital code><YYYYMMDD><3-digit seq>, e.g. INVCCH20261005002 — same
// pattern and hospital short code as certificate numbers (see
// certificateController.js's generateCertificateNumber), just its own
// counter collection (model/billCounter.js) so the two sequences never
// interfere with each other.
const generateBillNumber = async (hospitalId) => {
    const code = await getOrCreateHospitalCode(hospitalId);
    const dateKey = moment().format('YYYYMMDD');

    const counter = await billCounterModel.findOneAndUpdate(
        { hospitalId, dateKey },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
    );
    const seq = String(counter.seq).padStart(3, '0');

    return `INV${code}${dateKey}${seq}`;
};

// Recomputes amounts server-side — never trusts client-sent totals. Clamps
// every number to a sane range so a crafted request can't produce a negative
// or runaway bill (e.g. negative quantity/unitAmount, or a discount larger
// than the subtotal inflating totalAmount upward instead of down).
const computeTotals = (lineItems = [], discount = 0, tax = 0) => {
    const normalizedItems = lineItems.map((item) => {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const unitAmount = Math.max(0, Number(item.unitAmount) || 0);
        return { ...item, quantity, unitAmount, amount: quantity * unitAmount };
    });

    const subTotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
    const clampedDiscount = Math.min(Math.max(0, Number(discount) || 0), subTotal);
    const clampedTax = Math.max(0, Number(tax) || 0);
    const totalAmount = Math.max(0, subTotal - clampedDiscount + clampedTax);

    return { lineItems: normalizedItems, subTotal, totalAmount, discount: clampedDiscount, tax: clampedTax };
};

// Statuses a bill can be created with (same set the admin Billing page uses).
const BILL_STATUSES = ['Unpaid', 'PartiallyPaid', 'Paid'];
const MANUAL_METHODS = ['Cash', 'UPI', 'Card'];
// No further payments (manual or link) are accepted on these.
const CLOSED_STATUSES = ['Paid', 'Refunded', 'Cancelled'];

const createBill = async (req, res) => {
    try {
        const {
            appointmentId, appointmentDetailId, userId, doctorId,
            patientName, patientMobile, lineItems = [], discount = 0, tax = 0,
            paymentStatus = 'Unpaid', paymentMethod, paidAmount, paymentReference
        } = req.body;

        if (!BILL_STATUSES.includes(paymentStatus)) {
            return errorResponse(res, `Invalid bill status "${paymentStatus}"`);
        }
        const hospitalId = req.hospitalId;

        if (!Array.isArray(lineItems) || lineItems.length === 0) {
            return errorResponse(res, 'At least one line item is required');
        }

        // Cross-check priced items against the charge master — only when the
        // client claims a chargeMasterId, since custom/free-text line items
        // (Billing.jsx's "isCustom" rows) have no charge-master entry to check.
        const chargeIds = lineItems.map((item) => item.chargeMasterId).filter(Boolean);
        if (chargeIds.length > 0) {
            const charges = await chargeMasterModel.find({ _id: { $in: chargeIds }, hospitalId, delete: false });
            const chargeById = new Map(charges.map((c) => [String(c._id), c]));
            for (const item of lineItems) {
                if (!item.chargeMasterId) continue;
                const charge = chargeById.get(String(item.chargeMasterId));
                if (!charge) {
                    return errorResponse(res, `Charge ${item.chargeMasterId} not found for this hospital`);
                }
                item.unitAmount = charge.amount;
                item.name = charge.name;
                item.category = charge.category;
            }
        }

        const {
            lineItems: computedItems, subTotal, totalAmount,
            discount: clampedDiscount, tax: clampedTax,
        } = computeTotals(lineItems, discount, tax);

        // Paid / PartiallyPaid at creation = money taken at the counter right
        // now: recorded as a real payment entry (same shape recordPayment
        // writes), so paidAmount/balanceAmount/payments stay consistent.
        let paid = 0;
        let balanceAmount = totalAmount;
        let method = null;
        let payments = [];

        if (paymentStatus === 'Paid' || paymentStatus === 'PartiallyPaid') {
            if (!MANUAL_METHODS.includes(paymentMethod)) {
                return errorResponse(res, 'Select a payment method (Cash, UPI or Card)');
            }

            if (paymentStatus === 'Paid') {
                paid = totalAmount;
            } else {
                paid = Number(paidAmount);
                if (!Number.isFinite(paid) || paid <= 0 || paid >= totalAmount) {
                    return errorResponse(res, `Amount paid must be more than 0 and less than the bill total of ${totalAmount}`);
                }
            }

            method = paymentMethod;
            balanceAmount = totalAmount - paid;
            if (paid > 0) {
                payments = [{ method, amount: paid, reference: paymentReference || undefined, paidAt: new Date() }];
            }
        }

        const newBill = await saveModel(billModel, {
            hospitalId, appointmentId, appointmentDetailId, userId, doctorId,
            billNumber: await generateBillNumber(hospitalId),
            patientName, patientMobile,
            lineItems: computedItems,
            subTotal, discount: clampedDiscount, tax: clampedTax, totalAmount,
            paidAmount: paid,
            balanceAmount,
            paymentStatus,
            paymentMethod: method,
            payments,
        });

        return successResponse(res, 'Bill created successfully', newBill);
    } catch (error) {
        console.error('Error creating bill:', error);
        return errorResponse(res, 'Error creating bill');
    }
};

const getBills = async (req, res) => {
    try {
        const { paymentStatus, limit = 50, offset = 0, searchQuery = '' } = req.body;

        const condition = scopeFilter(req, { delete: false });
        if (paymentStatus) condition.paymentStatus = paymentStatus;

        const { data: bills, totalRecords } = await selectdatv2(
            billModel, condition, '', parseInt(limit), parseInt(offset),
            'billNumber patientName patientMobile', searchQuery, { create: -1 }
        );

        return successResponse(res, 'Bills fetched successfully', { bills, totalRecords });
    } catch (error) {
        console.error('Error fetching bills:', error);
        return errorResponse(res, 'Error fetching bills');
    }
};

const getBillById = async (req, res) => {
    try {
        const { billId } = req.body;
        if (!billId) {
            return errorResponse(res, 'billId is required');
        }

        const bill = await billModel.findOne(scopeFilter(req, { _id: billId, delete: false }))
            .populate('doctorId', 'name mobileNumber address degree')
            .populate('hospitalId', 'name address city mobileNumber email')
            .populate('userId', 'fullName mobileNumber address');

        if (!bill) {
            return errorResponse(res, 'Bill not found');
        }

        return successResponse(res, 'Bill fetched successfully', bill);
    } catch (error) {
        console.error('Error fetching bill:', error);
        return errorResponse(res, 'Error fetching bill');
    }
};

const updateBill = async (req, res) => {
    try {
        const { billId, lineItems, discount, tax } = req.body;
        if (!billId) {
            return errorResponse(res, 'billId is required');
        }

        const existing = await findScoped(billModel, billId, req);
        if (!existing) {
            return errorResponse(res, 'Bill not found');
        }
        if (!['Unpaid', 'PartiallyPaid'].includes(existing.paymentStatus)) {
            return errorResponse(res, `Cannot edit a bill with status "${existing.paymentStatus}"`);
        }

        const {
            lineItems: computedItems, subTotal, totalAmount,
            discount: clampedDiscount, tax: clampedTax,
        } = computeTotals(
            lineItems ?? existing.lineItems,
            discount ?? existing.discount,
            tax ?? existing.tax
        );

        const updated = await updateModelStrict(billModel, { _id: billId }, {
            lineItems: computedItems,
            subTotal,
            discount: clampedDiscount,
            tax: clampedTax,
            totalAmount,
            balanceAmount: Math.max(0, totalAmount - existing.paidAmount),
            update: new Date(),
        });

        return successResponse(res, 'Bill updated successfully', updated);
    } catch (error) {
        console.error('Error updating bill:', error);
        return errorResponse(res, 'Error updating bill');
    }
};

// Shared recompute-after-payment logic used by both manual payments and link
// verification. A single atomic aggregation-pipeline update: paidAmount,
// balanceAmount, and paymentStatus are all derived from the server's own
// current value of paidAmount in one operation, so two concurrent payments
// on the same bill can't race a read-modify-write and lose one of them —
// each one's $add sees the other's already-applied increment. The
// paymentStatus != 'Paid' guard makes a bill's final payment the last one
// that can ever apply.
const applyPayment = async (bill, method, amount, reference) => {
    const paymentEntry = { method, amount, reference, paidAt: new Date() };

    const updated = await billModel.findOneAndUpdate(
        { _id: bill._id, paymentStatus: { $nin: CLOSED_STATUSES } },
        [
            { $set: { paidAmount: { $add: ['$paidAmount', amount] } } },
            {
                $set: {
                    balanceAmount: { $max: [0, { $subtract: ['$totalAmount', '$paidAmount'] }] },
                    paymentStatus: { $cond: [{ $gte: ['$paidAmount', '$totalAmount'] }, 'Paid', 'PartiallyPaid'] },
                },
            },
            { $set: { payments: { $concatArrays: ['$payments', [paymentEntry]] }, paymentMethod: method, update: '$$NOW' } },
        ],
        { new: true }
    );
    return updated; // null means the bill was already paid/closed when this ran
};

const closedBillMessage = (status) =>
    status === 'Paid' ? 'Bill is already fully paid' : `Bill is ${status} — payments can't be taken on it`;

const recordPayment = async (req, res) => {
    try {
        const { billId, method, amount, reference } = req.body;
        if (!billId || !method) {
            return errorResponse(res, 'billId and method are required');
        }

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            return errorResponse(res, 'amount must be a positive number');
        }

        const bill = await findScoped(billModel, billId, req);
        if (!bill) {
            return errorResponse(res, 'Bill not found');
        }
        if (CLOSED_STATUSES.includes(bill.paymentStatus)) {
            return errorResponse(res, closedBillMessage(bill.paymentStatus));
        }
        if (numericAmount > bill.balanceAmount) {
            return errorResponse(res, `Payment of ${numericAmount} exceeds the outstanding balance of ${bill.balanceAmount}`);
        }

        const updated = await applyPayment(bill, method, numericAmount, reference);
        if (!updated) {
            return errorResponse(res, 'Bill is already paid or closed');
        }
        return successResponse(res, 'Payment recorded successfully', updated);
    } catch (error) {
        console.error('Error recording payment:', error);
        return errorResponse(res, 'Error recording payment');
    }
};

const generatePaymentLink = async (req, res) => {
    try {
        const { billId } = req.body;
        if (!billId) {
            return errorResponse(res, 'billId is required');
        }

        const bill = await findScoped(billModel, billId, req);
        if (!bill) {
            return errorResponse(res, 'Bill not found');
        }
        if (CLOSED_STATUSES.includes(bill.paymentStatus)) {
            return errorResponse(res, closedBillMessage(bill.paymentStatus));
        }
        if (bill.balanceAmount <= 0) {
            return errorResponse(res, 'This bill has no outstanding balance');
        }

        const link = await createUpiLink({
            name: bill.patientName,
            amount: bill.balanceAmount,
            date: new Date().toISOString().slice(0, 10),
        });

        const updated = await updateModel(billModel, { _id: billId }, {
            paymentLink: { ...link, status: 'Pending' },
            update: new Date(),
        });

        return successResponse(res, 'Payment link generated successfully', updated);
    } catch (error) {
        console.error('Error generating payment link:', error.response?.data || error.message);
        return errorResponse(res, 'Error generating payment link');
    }
};

// There's no approved WhatsApp Business template for payment links (only
// appointment-notification templates exist), so this returns a wa.me deep
// link for the frontend to open — same mechanism the original standalone
// Payment page used, just with the message built from real bill data now.
// wa.me requires full international format (country code + number, no
// leading 0/+). Bare 10-digit Indian numbers are not valid wa.me targets and
// produce unpredictable redirect behavior in the browser.
const toWhatsAppNumber = (mobile) => {
    const digits = String(mobile).replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    return digits;
};

const sendPaymentLink = async (req, res) => {
    try {
        const { billId, mobile } = req.body;
        if (!billId || !mobile) {
            return errorResponse(res, 'billId and mobile are required');
        }

        const bill = await findScoped(billModel, billId, req);
        if (!bill || !bill.paymentLink?.url) {
            return errorResponse(res, 'Generate a payment link for this bill first');
        }

        const message = `Hello ${bill.patientName}! Your bill ${bill.billNumber} total is ₹${bill.totalAmount} (balance ₹${bill.balanceAmount}).\n\nPay using this UPI link:\n${bill.paymentLink.url}\n\nThank you!`;
        const whatsappUrl = `https://wa.me/${toWhatsAppNumber(mobile)}?text=${encodeURIComponent(message)}`;

        const updated = await updateModel(billModel, { _id: billId }, {
            'paymentLink.sentTo': mobile,
            'paymentLink.sentAt': new Date(),
            update: new Date(),
        });

        return successResponse(res, 'Payment link ready to send', { ...updated.toObject(), whatsappUrl });
    } catch (error) {
        console.error('Error sending payment link:', error);
        return errorResponse(res, 'Error sending payment link');
    }
};

// Manual verification for now (no webhook from the UPI microservice yet) —
// hospital staff confirm the payment came through, which records it as a
// PaymentLink payment and advances paymentStatus the same way recordPayment does.
const verifyPaymentLink = async (req, res) => {
    try {
        const { billId } = req.body;
        if (!billId) {
            return errorResponse(res, 'billId is required');
        }

        const bill = await findScoped(billModel, billId, req);
        if (!bill || !bill.paymentLink?.url) {
            return errorResponse(res, 'No payment link to verify for this bill');
        }
        if (['Refunded', 'Cancelled'].includes(bill.paymentStatus)) {
            return errorResponse(res, closedBillMessage(bill.paymentStatus));
        }

        // Status-guarded so the same link can't be verified twice — the
        // write only succeeds for the request that wins the race, and that
        // flip also stops a second applyPayment from double-crediting the balance.
        const claimed = await billModel.findOneAndUpdate(
            { _id: billId, 'paymentLink.status': 'Pending' },
            { $set: { 'paymentLink.status': 'Verified', 'paymentLink.verifiedAt': new Date() } },
            { new: true }
        );
        if (!claimed) {
            return errorResponse(res, 'This payment link was already verified');
        }

        if (bill.balanceAmount > 0) {
            await applyPayment(bill, 'PaymentLink', bill.balanceAmount, bill.paymentLink.externalRef);
        }

        const updated = await billModel.findById(billId);
        return successResponse(res, 'Payment verified successfully', updated);
    } catch (error) {
        console.error('Error verifying payment link:', error);
        return errorResponse(res, 'Error verifying payment link');
    }
};

const getBillingHistory = async (req, res) => {
    try {
        const { userId, mobile, limit = 50, offset = 0 } = req.body;
        if (!userId && !mobile) {
            return errorResponse(res, 'userId or mobile is required');
        }

        const condition = scopeFilter(req, { delete: false });
        if (userId) condition.userId = userId;
        if (mobile) condition.patientMobile = mobile;

        const { data: bills, totalRecords } = await selectdatv2(
            billModel, condition, '', parseInt(limit), parseInt(offset), '', '', { create: -1 }
        );

        return successResponse(res, 'Billing history fetched successfully', { bills, totalRecords });
    } catch (error) {
        console.error('Error fetching billing history:', error);
        return errorResponse(res, 'Error fetching billing history');
    }
};

module.exports = {
    addCharge, getCharges, editCharge, deleteCharge,
    createBill, getBills, getBillById, updateBill,
    recordPayment, generatePaymentLink, sendPaymentLink, verifyPaymentLink,
    getBillingHistory,
};
