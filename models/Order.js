const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },
  bn: { type: String, required: true },
  an: { type: String, required: true },
  pr: { type: Number, required: true, min: 0 },
  cat: { type: String, required: true },
  img: { type: String, required: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  userEmail: { type: String, required: true, lowercase: true, index: true },
  buyerName: { type: String, required: true },
  buyerMobile: { type: String, required: true, trim: true },
  shippingAddress: {
    addressLine: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true }
  },
  items: { type: [orderItemSchema], required: true },
  total: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['Payment Pending', 'Payment Failed', 'Paid', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'],
    default: 'Payment Pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Authorized', 'Success', 'Failed'],
    default: 'Pending',
    index: true
  },
  razorpayOrderId: { type: String, index: true, sparse: true },
  razorpayPaymentId: { type: String, index: true, sparse: true },
  razorpaySignature: { type: String, select: false },
  paymentMethod: { type: String, default: '' },
  paymentFailureReason: { type: String, default: '' }
}, { timestamps: true });

orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema, 'orders');
