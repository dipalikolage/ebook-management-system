const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, lowercase: true, index: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    bn: { type: String, required: true },
    an: { type: String, required: true },
    pr: { type: Number, required: true, min: 0 },
    cat: { type: String, required: true },
    img: { type: String, required: true }
  },
  { timestamps: true }
);

cartSchema.index({ userEmail: 1, bookId: 1 }, { unique: true });

module.exports = mongoose.model('Cart', cartSchema, 'addcarts');
