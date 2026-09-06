const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    bname: { type: String, required: true, trim: true, maxlength: 200 },
    aname: { type: String, required: true, trim: true, maxlength: 150 },
    price: { type: Number, required: true, min: 0 },
    categorie: { type: String, required: true, enum: ['new', 'recent', 'old'] },
    image: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

bookSchema.index({ categorie: 1, createdAt: -1 });
bookSchema.index({ bname: 'text', aname: 'text' });

module.exports = mongoose.model('Book', bookSchema, 'addbooks');
