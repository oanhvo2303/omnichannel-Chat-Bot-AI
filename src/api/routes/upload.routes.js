'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware'); // Bug 5b
const { writeAudit, getClientIp } = require('../services/auditService');
const { getDB } = require('../../infra/database/sqliteConnection');

// Magic byte signatures cho các định dạng được phép
const MAGIC_BYTES = {
  'image/jpeg':       { offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  'image/png':        { offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] },
  'image/gif':        { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  'image/webp':       { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  'video/mp4':        { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp box
  'video/webm':       { offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] },
  'video/quicktime':  { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
  'video/x-msvideo':  { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
};

/**
 * Đọc magic bytes của file đã lưu — trả về false nếu không khớp mimetype.
 */
function checkMagicBytes(filePath, mimetype) {
  const rule = MAGIC_BYTES[mimetype];
  if (!rule) return false; // Không có rule = không cho phép
  try {
    const buf = Buffer.alloc(rule.offset + rule.bytes.length);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return rule.bytes.every((b, i) => buf[rule.offset + i] === b);
  } catch {
    return false;
  }
}

const router = express.Router();

// Thư mục lưu media
const UPLOAD_DIR = path.join(__dirname, '../../uploads/bot_media');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ✅ URL công khai dùng SITE_URL từ env (tránh localhost trả về cho browser)
const getSiteUrl = (req) => {
  return process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
};

// FIX: Extension an toàn lấy từ mimetype whitelist — không tin originalname
// Tránh các bypass như: upload file HTML với MIME image/jpeg và tên file.html
const MIME_TO_SAFE_EXT = {
  'image/jpeg':        '.jpg',
  'image/png':         '.png',
  'image/gif':         '.gif',
  'image/webp':        '.webp',
  'video/mp4':         '.mp4',
  'video/webm':        '.webm',
  'video/quicktime':   '.mov',
  'video/x-msvideo':   '.avi',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    // FIX: Dùng safe extension từ whitelist — bỏ extension từ originalname
    const ext = MIME_TO_SAFE_EXT[file.mimetype] || '.bin';
    cb(null, `bot_${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

const fileFilter = (_req, file, cb) => {
  if ([...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ hỗ trợ ảnh (JPG/PNG/GIF/WebP) và video (MP4/WebM/MOV).'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (đủ cho video)
});

// =============================================
// POST /api/upload — Upload ảnh/video cho Bot Rules
// =============================================
router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không nhận được file.' });
    }

    // FIX: Kiểm tra magic bytes thực tế của file sau khi lưu
    const filePath = req.file.path;
    if (!checkMagicBytes(filePath, req.file.mimetype)) {
      fs.unlinkSync(filePath); // Xóa file giả mạo
      return res.status(400).json({ error: 'File không hợp lệ: nội dung không khớp định dạng.' });
    }
    const siteUrl = getSiteUrl(req);
    const publicUrl = `${siteUrl}/uploads/bot_media/${req.file.filename}`;
    const isVideo = ALLOWED_VIDEO_TYPES.includes(req.file.mimetype);

    // ★ Lưu vào MediaLibrary DB để hiển thị thư viện
    try {
      const db = getDB();
      await db.run(
        'INSERT INTO MediaLibrary (shop_id, filename, url, mimetype, size) VALUES (?, ?, ?, ?, ?)',
        [req.shop.shopId, req.file.filename, publicUrl, req.file.mimetype, req.file.size]
      );
    } catch (dbErr) {
      // DB chưa có bảng → không block upload
      console.warn('[UPLOAD] MediaLibrary insert failed:', dbErr.message);
    }

    console.log(`[UPLOAD] ✅ ${req.file.originalname} → ${req.file.filename} (${(req.file.size / 1024).toFixed(1)}KB) [${isVideo ? 'VIDEO' : 'IMAGE'}]`);

    res.json({
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      type: isVideo ? 'video' : 'image',
    });
  } catch (error) {
    console.error('[UPLOAD] Lỗi:', error.message);
    res.status(500).json({ error: 'Lỗi upload file.' });
  }
});

// =============================================
// GET /api/upload/library — Thư viện media của shop
// =============================================
router.get('/library', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const items = await db.all(
      'SELECT id, filename, url, mimetype, size, created_at FROM MediaLibrary WHERE shop_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.shop.shopId]
    );
    res.json({ items });
  } catch (error) {
    console.error('[UPLOAD LIBRARY] Lỗi:', error.message);
    // Fallback: nếu bảng chưa tạo xong
    res.json({ items: [] });
  }
});

// =============================================
// DELETE /api/upload/library/:id — Xóa file khỏi thư viện (owner/admin only)
// =============================================
// Bug 5b fix: thêm requireOwnerOrAdmin — staff không được xóa media của shop
router.delete('/library/:id', authMiddleware, requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const item = await db.get(
      'SELECT id, filename FROM MediaLibrary WHERE id = ? AND shop_id = ?',
      [req.params.id, req.shop.shopId]
    );
    if (!item) return res.status(404).json({ error: 'File không tồn tại.' });

    // Xóa file vật lý
    const filePath = path.join(UPLOAD_DIR, item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.run('DELETE FROM MediaLibrary WHERE id = ?', [item.id]);
    writeAudit({ shopId: req.shop.shopId, actorId: req.shop.staffId, actorRole: req.shop.role, action: 'DELETE_MEDIA', resource: 'MediaLibrary', resourceId: req.params.id, ip: getClientIp(req) });
    res.json({ success: true });
  } catch (error) {
    console.error('[UPLOAD DELETE] Lỗi:', error.message);
    res.status(500).json({ error: 'Lỗi xóa file.' });
  }
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File quá lớn. Tối đa 50MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
});

module.exports = router;
