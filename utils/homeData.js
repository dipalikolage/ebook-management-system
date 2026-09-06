const Book = require('../models/Book');

async function getHomeData() {
  const [ndata, rdata, odata] = await Promise.all([
    Book.find({ categorie: 'new' }).sort({ createdAt: -1 }).lean(),
    Book.find({ categorie: 'recent' }).sort({ createdAt: -1 }).lean(),
    Book.find({ categorie: 'old' }).sort({ createdAt: -1 }).lean()
  ]);
  return { ndata, rdata, odata };
}

module.exports = { getHomeData };
