const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
    chargeMasterId: { type: mongoose.Schema.Types.ObjectId, ref: 'chargeMaster', required: false },
    name: { type: String, required: true },
    category: { type: String, required: false },
    quantity: { type: Number, default: 1 },
    unitAmount: { type: Number, required: true },
    amount: { type: Number, required: true }, // quantity * unitAmount, computed server-side
    isCustom: { type: Boolean, default: false },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
    method: { type: String, enum: ["Cash", "UPI", "Card", "PaymentLink"], required: true },
    amount: { type: Number, required: true },
    reference: { type: String, required: false },
    paidAt: { type: Date, default: Date.now },
    recordedBy: { type: String, required: false },
}, { _id: false });

const paymentLinkSchema = new mongoose.Schema({
    url: { type: String, required: false },
    provider: { type: String, required: false },
    externalRef: { type: String, required: false },
    sentTo: { type: String, required: false },
    sentAt: { type: Date, required: false },
    verifiedAt: { type: Date, required: false },
    status: { type: String, enum: ["Pending", "Verified", "Failed"], default: "Pending" },
}, { _id: false });

const billSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'hospital', required: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'appointment', required: false },
    appointmentDetailId: { type: mongoose.Schema.Types.ObjectId, ref: 'appointmentdetail', required: false },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'doctor', required: false },

    billNumber: { type: String, required: true },
    patientName: { type: String, required: false },
    patientMobile: { type: String, required: false },

    lineItems: { type: [lineItemSchema], default: [] },

    subTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },

    paymentMethod: { type: String, enum: ["Cash", "UPI", "Card", "PaymentLink", null], default: null },
    paymentStatus: {
        type: String,
        enum: ["Unpaid", "PartiallyPaid", "Paid", "Refunded", "Cancelled"],
        default: "Unpaid"
    },

    paymentLink: { type: paymentLinkSchema, default: {} },
    payments: { type: [paymentSchema], default: [] },

    create: { type: Date, default: Date.now },
    update: { type: Date, default: Date.now },
    delete: { type: Boolean, default: false },
}, { minimize: false });

const bill = mongoose.model('bill', billSchema);

module.exports = bill;
