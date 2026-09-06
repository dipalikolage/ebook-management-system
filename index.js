require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const connectDB = require('./db');
const User = require('./models/User');
const Book = require('./models/Book');
const Cart = require('./models/Cart');
const Order = require('./models/Order');
const { requireLogin, requireAdmin } = require('./middleware/auth');
const { getHomeData } = require('./utils/homeData');

const app = express();
const PORT = Number(process.env.PORT) || 2300;

const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;
const imageDir = path.join(__dirname, 'img');
fs.mkdirSync(imageDir, { recursive: true });

const storage = multer.diskStorage({
  destination: imageDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.formatPrice = value => `₹${Number(value || 0).toFixed(2)}`;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'development-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 4 }
}));
app.use('/img', express.static(imageDir, { maxAge: '7d' }));
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.get('/', async (_req, res) => {
  res.render('home', await getHomeData());
});

app.get('/login', (_req, res) => res.render('login'));
app.get('/register', (_req, res) => res.render('register'));

app.post('/reg', async (req, res, next) => {
  try {
    const { name, email, mobile, password } = req.body;
    if (!name || !email || !mobile || !password || password.length < 6) {
      return res.status(400).send('Please provide valid registration details. Password must be at least 6 characters.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await User.exists({ email: normalizedEmail });
    if (exists) return res.status(409).send('An account with this email already exists.');

    const hashedPassword = await bcrypt.hash(password, 12);
    await User.create({ name, email: normalizedEmail, mobile, password: hashedPassword });
    res.redirect('/login?registered=1');
  } catch (err) {
    next(err);
  }
});

app.post('/log', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });

    if (!user) return res.status(401).send('Invalid email or password.');

    let valid = await bcrypt.compare(password, user.password).catch(() => false);

    // Backward compatibility for the old project, which stored plain-text passwords.
    if (!valid && user.password === password) {
      valid = true;
      user.password = await bcrypt.hash(password, 12);
      await user.save();
    }

    if (!valid) return res.status(401).send('Invalid email or password.');

    const isAdmin = email === (process.env.ADMIN_EMAIL || 'admin@admin.com');
    req.session.user = { id: user._id.toString(), name: user.name, email, isAdmin };
    res.redirect(isAdmin ? '/admin' : '/uhome');
  } catch (err) {
    next(err);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/uhome', requireLogin, async (_req, res, next) => {
  try {
    res.render('uhome', await getHomeData());
  } catch (err) { next(err); }
});

app.get('/new', async (_req, res, next) => {
  try {
    const newdata = await Book.find({ categorie: 'new' }).sort({ createdAt: -1 }).lean();
    res.render('new', { books: newdata, title: 'New Books' });
  } catch (err) { next(err); }
});

app.get('/recent', async (_req, res, next) => {
  try {
    const books = await Book.find({ categorie: 'recent' }).sort({ createdAt: -1 }).lean();
    res.render('new', { books, title: 'Recent Books' });
  } catch (err) { next(err); }
});

app.get('/old', async (_req, res, next) => {
  try {
    const books = await Book.find({ categorie: 'old' }).sort({ createdAt: -1 }).lean();
    res.render('new', { books, title: 'Old Books' });
  } catch (err) { next(err); }
});

app.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.redirect('/');
    const books = await Book.find({ $text: { $search: q } }).sort({ score: { $meta: 'textScore' } }).lean();
    res.render('new', { books, title: `Search results for "${q}"` });
  } catch (err) { next(err); }
});

app.get('/add/:id', async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book) return res.status(404).send('Book not found');
    res.render('add', { dt: book });
  } catch (err) { next(err); }
});

app.get('/view/:id', async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book) return res.status(404).send('Book not found');
    res.render('viewd', { dt2: book });
  } catch (err) { next(err); }
});

app.get('/admin', requireAdmin, (_req, res) => res.render('ahome'));
app.get('/adb', requireAdmin, (_req, res) => res.render('adb'));

app.post('/adb2', requireAdmin, upload.single('img'), async (req, res, next) => {
  try {
    const { bname, an, pr, cat } = req.body;
    const price = Number(pr);
    if (!bname || !an || !['new', 'recent', 'old'].includes(cat) || !Number.isFinite(price) || price < 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).send('Invalid book details.');
    }

    const image = req.file ? req.file.filename : String(req.body.image || '').trim();
    if (!image) return res.status(400).send('Please upload a book image.');

    await Book.create({ bname, aname: an, price, categorie: cat, image });
    res.redirect('/adb');
  } catch (err) { next(err); }
});

app.get('/adcrt/:id', requireLogin, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book) return res.status(404).send('Book not found');

    await Cart.updateOne(
      { userEmail: req.session.user.email, bookId: book._id },
      { $setOnInsert: { userEmail: req.session.user.email, bookId: book._id, bn: book.bname, an: book.aname, pr: book.price, cat: book.categorie, img: book.image } },
      { upsert: true }
    );
    res.redirect('/crt');
  } catch (err) { next(err); }
});

app.get('/crt', requireLogin, async (req, res, next) => {
  try {
    const bdata = await Cart.find({ userEmail: req.session.user.email }).sort({ createdAt: -1 }).lean();
    const total = bdata.reduce((sum, item) => sum + Number(item.pr || 0), 0);
    res.render('ftuser', { bdata, total });
  } catch (err) { next(err); }
});

app.get('/checkout', requireLogin, async (req, res, next) => {
  try {
    const items = await Cart.find({ userEmail: req.session.user.email }).sort({ createdAt: -1 }).lean();
    if (!items.length) return res.redirect('/crt');
    const total = items.reduce((sum, item) => sum + Number(item.pr || 0), 0);
    const user = await User.findById(req.session.user.id).lean();
    res.render('checkout', { items, total, buyer: req.session.user, mobile: user?.mobile || '', razorpayEnabled: Boolean(razorpay), razorpayKeyId: process.env.RAZORPAY_KEY_ID || '' });
  } catch (err) { next(err); }
});

// Create our database order and the corresponding Razorpay order.
// The cart is NOT cleared here. It is cleared only after server-side payment verification succeeds.
app.post('/payment/create-order', requireLogin, async (req, res, next) => {
  try {
    if (!razorpay) return res.status(503).json({ error: 'Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.' });

    const items = await Cart.find({ userEmail: req.session.user.email }).lean();
    if (!items.length) return res.status(400).json({ error: 'Your cart is empty.' });

    const { addressLine, city, state, pincode } = req.body;
    const cleanAddress = String(addressLine || '').trim();
    const cleanCity = String(city || '').trim();
    const cleanState = String(state || '').trim();
    const cleanPincode = String(pincode || '').trim();

    if (!cleanAddress || !cleanCity || !cleanState || !/^\d{6}$/.test(cleanPincode)) {
      return res.status(400).json({ error: 'Please enter a valid delivery address and 6-digit pincode.' });
    }

    const user = await User.findById(req.session.user.id).lean();
    if (!user) return res.status(401).json({ error: 'User account not found.' });

    const total = items.reduce((sum, item) => sum + Number(item.pr || 0), 0);
    if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: 'Invalid order amount.' });

    const localOrder = await Order.create({
      userId: req.session.user.id,
      userEmail: req.session.user.email,
      buyerName: req.session.user.name,
      buyerMobile: user.mobile,
      shippingAddress: { addressLine: cleanAddress, city: cleanCity, state: cleanState, pincode: cleanPincode },
      items: items.map(item => ({ bookId: item.bookId, bn: item.bn, an: item.an, pr: item.pr, cat: item.cat, img: item.img })),
      total,
      status: 'Payment Pending',
      paymentStatus: 'Pending'
    });

    try {
      const rpOrder = await razorpay.orders.create({
        amount: Math.round(total * 100),
        currency: 'INR',
        receipt: `book-${localOrder._id.toString()}`,
        notes: { localOrderId: localOrder._id.toString(), userId: req.session.user.id }
      });

      localOrder.razorpayOrderId = rpOrder.id;
      await localOrder.save();

      return res.json({
        keyId: process.env.RAZORPAY_KEY_ID,
        razorpayOrderId: rpOrder.id,
        localOrderId: localOrder._id.toString(),
        amount: rpOrder.amount,
        currency: rpOrder.currency,
        name: 'BookApp',
        prefill: { name: req.session.user.name, email: req.session.user.email, contact: user.mobile }
      });
    } catch (paymentErr) {
      await Order.findByIdAndUpdate(localOrder._id, { status: 'Payment Failed', paymentStatus: 'Failed', paymentFailureReason: 'Unable to create Razorpay order.' });
      throw paymentErr;
    }
  } catch (err) { next(err); }
});

app.post('/payment/verify', requireLogin, async (req, res, next) => {
  try {
    if (!razorpay) return res.status(503).json({ error: 'Razorpay is not configured.' });

    const { localOrderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (!localOrderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Incomplete payment response.' });
    }

    const order = await Order.findOne({ _id: localOrderId, userEmail: req.session.user.email });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.razorpayOrderId !== razorpay_order_id) return res.status(400).json({ error: 'Razorpay order mismatch.' });

    // Razorpay requires server-side HMAC verification before fulfilling the order.
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${order.razorpayOrderId}|${razorpay_payment_id}`)
      .digest('hex');

    const signaturesMatch = expectedSignature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));

    if (!signaturesMatch) {
      order.status = 'Payment Failed';
      order.paymentStatus = 'Failed';
      order.paymentFailureReason = 'Invalid payment signature.';
      await order.save();
      return res.status(400).json({ error: 'Payment verification failed.' });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    const expectedAmount = Math.round(Number(order.total) * 100);
    if (payment.order_id !== order.razorpayOrderId || Number(payment.amount) !== expectedAmount || payment.currency !== 'INR') {
      order.status = 'Payment Failed';
      order.paymentStatus = 'Failed';
      order.paymentFailureReason = 'Payment amount/order validation failed.';
      await order.save();
      return res.status(400).json({ error: 'Payment details could not be validated.' });
    }

    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paymentMethod = payment.method || '';
    order.paymentStatus = payment.status === 'captured' ? 'Success' : 'Authorized';
    order.status = payment.status === 'captured' ? 'Paid' : 'Payment Pending';
    await order.save();

    if (payment.status === 'captured') {
      await Cart.deleteMany({ userEmail: req.session.user.email });
    }

    return res.json({ success: true, captured: payment.status === 'captured', orderId: order._id.toString() });
  } catch (err) { next(err); }
});

app.post('/payment/failure', requireLogin, async (req, res, next) => {
  try {
    const { localOrderId, errorDescription } = req.body;
    if (localOrderId) {
      await Order.findOneAndUpdate(
        { _id: localOrderId, userEmail: req.session.user.email },
        { status: 'Payment Failed', paymentStatus: 'Failed', paymentFailureReason: String(errorDescription || 'Payment was cancelled or failed.').slice(0, 500) }
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

app.get('/orders', requireLogin, async (req, res, next) => {
  try {
    const orders = await Order.find({ userEmail: req.session.user.email }).sort({ createdAt: -1 }).lean();
    res.render('orders', { orders, placed: req.query.placed === '1', payment: req.query.payment || '' });
  } catch (err) { next(err); }
});

app.get('/delete/:id', requireLogin, async (req, res, next) => {
  try {
    await Cart.deleteOne({ _id: req.params.id, userEmail: req.session.user.email });
    res.redirect('/crt');
  } catch (err) { next(err); }
});

app.post('/admin/orders/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
    const status = String(req.body.status || '');
    if (!allowed.includes(status)) return res.status(400).send('Invalid order status.');

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found.');
    if (order.paymentStatus !== 'Success') return res.status(400).send('Only paid orders can be moved to fulfilment statuses.');
    if (order.status === 'Delivered' && status !== 'Delivered') return res.status(400).send('A delivered order cannot be moved back.');
    if (order.status === 'Cancelled' && status !== 'Cancelled') return res.status(400).send('A cancelled order cannot be reopened from this screen.');

    order.status = status;
    await order.save();
    res.redirect('/fetchall');
  } catch (err) { next(err); }
});

app.get('/fetchall', requireAdmin, async (_req, res, next) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    res.render('fetch', { orders });
  } catch (err) { next(err); }
});

app.get('/cu', (_req, res) => res.render('contact'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send(err.message || 'Something went wrong.');
});

connectDB()
  .then(() => app.listen(PORT, () => console.log(`E-book app started on http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });
