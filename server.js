const express = require('express');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Config ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const UPLOAD_DIR = path.join(__dirname, 'public', 'audio');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'audio-site-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ─── Multer setup ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._\-\u00C0-\u024F\u1E00-\u1EFF ]/g, '_');
    const unique = Date.now() + '_' + safe;
    cb(null, unique);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /audio\/(mpeg|mp4|ogg|wav|webm|flac|aac|x-m4a)|video\/mp4/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file audio!'));
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// ─── Auth middleware ─────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
};

// ─── Routes: Public ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/tracks', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(f => /\.(mp3|wav|ogg|flac|aac|m4a|webm)$/i.test(f))
      .map(filename => {
        const stat = fs.statSync(path.join(UPLOAD_DIR, filename));
        // Strip timestamp prefix for display name
        const displayName = filename.replace(/^\d+_/, '').replace(/\.[^.]+$/, '');
        return {
          filename,
          displayName,
          size: stat.size,
          uploadedAt: stat.birthtime,
          url: `/audio/${encodeURIComponent(filename)}`
        };
      })
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json({ tracks: files });
  } catch (err) {
    res.status(500).json({ error: 'Không thể đọc danh sách file' });
  }
});

// ─── Routes: Admin ───────────────────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Sai mật khẩu!' });
  }
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/admin/upload', requireAuth, (req, res) => {
  upload.single('audio')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Không có file nào được upload' });
    res.json({
      success: true,
      message: `Upload thành công: ${req.file.originalname}`,
      filename: req.file.filename
    });
  });
});

app.delete('/admin/tracks/:filename', requireAuth, (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File không tồn tại' });
  try {
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Không thể xóa file' });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🎵 Audio Site running at http://localhost:${PORT}`);
  console.log(`🔑 Admin password: ${ADMIN_PASSWORD}`);
});
