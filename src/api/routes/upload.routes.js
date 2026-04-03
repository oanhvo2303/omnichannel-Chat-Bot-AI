'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// Thư mục lưu ảnh
const UPLOAD_DIR = path.join(__dirname, '../../uploads/bot_media');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Cấu hình Multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `bot_${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ hỗ trợ ảnh JPG, PNG, GIF, WebP.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/**
 * POST /api/upload
 * Upload ảnh cho Bot Rules.
 * Trả về URL public để lưu vào BotRules.media_url
 */
router.post('/', authMiddleware, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không nhận được file ảnh.' });
    }

    // Tạo URL public
    const protocol = req.protocol;
    const host = req.get('host');
    const publicUrl = `${protocol}://${host}/uploads/bot_media/${req.file.filename}`;

    console.log(`[UPLOAD] ✅ ${req.file.originalname} → ${req.file.filename} (${(req.file.size / 1024).toFixed(1)}KB)`);

    res.json({
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error('[UPLOAD] Lỗi:', error.message);
    res.status(500).json({ error: 'Lỗi upload ảnh.' });
  }
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File quá lớn. Tối đa 5MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
