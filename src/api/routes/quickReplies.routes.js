'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

/** GET /api/quick-replies — Danh sách tin nhắn mẫu */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const replies = await db.all(
      'SELECT * FROM QuickReplies WHERE shop_id = ? ORDER BY shortcut',
      [req.shop.shopId]
    );
    res.json(replies);
  } catch (error) {
    console.error('[QR] Lỗi:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/quick-replies — Tạo tin nhắn mẫu mới */
router.post('/', async (req, res) => {
  try {
    const { shortcut, content, image_url } = req.body;
    if (!shortcut || !content) {
      return res.status(400).json({ error: 'shortcut và content là bắt buộc.' });
    }

    const db = getDB();
    const s = shortcut.startsWith('/') ? shortcut : `/${shortcut}`;
    const result = await db.run(
      'INSERT INTO QuickReplies (shop_id, shortcut, content, image_url) VALUES (?, ?, ?, ?)',
      [req.shop.shopId, s.trim(), content.trim(), image_url || null]
    );

    res.status(201).json({ id: result.lastID, shop_id: req.shop.shopId, shortcut: s.trim(), content: content.trim(), image_url: image_url || null });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Shortcut này đã tồn tại.' });
    }
    console.error('[QR] Lỗi tạo:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PUT /api/quick-replies/:id — Cập nhật */
router.put('/:id', async (req, res) => {
  try {
    const { shortcut, content, image_url } = req.body;
    const db = getDB();
    const s = shortcut?.startsWith('/') ? shortcut : `/${shortcut}`;

    // Tạo câu truy vấn động để update (tránh null đè lên giá trị cũ nếu client ko upload)
    const updates = [];
    const params = [];
    if (s) { updates.push('shortcut = ?'); params.push(s.trim()); }
    if (content !== undefined) { updates.push('content = ?'); params.push(content.trim()); }
    if (image_url !== undefined) { updates.push('image_url = ?'); params.push(image_url); } // có thể nhận null để xóa ảnh

    if (updates.length === 0) return res.status(400).json({ error: 'Không có dữ liệu cập nhật.' });

    params.push(req.params.id, req.shop.shopId);

    await db.run(
      `UPDATE QuickReplies SET ${updates.join(', ')} WHERE id = ? AND shop_id = ?`,
      params
    );
    res.json({ message: 'Đã cập nhật.' });
  } catch (error) {
    console.error('[QR] Lỗi cập nhật:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** DELETE /api/quick-replies/:id — Xóa */
router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    await db.run('DELETE FROM QuickReplies WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    res.json({ message: 'Đã xóa.' });
  } catch (error) {
    console.error('[QR] Lỗi xóa:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
