function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user?.isAdmin) return res.status(403).send('Access denied');
  next();
}

module.exports = { requireLogin, requireAdmin };
