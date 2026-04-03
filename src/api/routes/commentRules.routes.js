'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

/** GET /api/comment-rules — Danh sách luật auto-reply comment */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const rules = await db.all(
      'SELECT * FROM CommentRules WHERE shop_id = ? ORDER BY created_at DESC',
      [req.shop.shopId]
    );

    // Parse trigger_keywords JSON
    const parsed = rules.map((r) => ({
      ...r,
      trigger_keywords: r.trigger_keywords ? JSON.parse(r.trigger_keywords) : null,
    }));

    res.json(parsed);
  } catch (error) {
    console.error('[COMMENT RULES] GET error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/comment-rules — Tạo luật mới */
router.post('/', async (req, res) => {
  try {
    const { post_id, trigger_keywords, reply_text, inbox_text, auto_hide } = req.body;

    // Validate: phải có ít nhất reply_text HOẶC inbox_text
    if (!reply_text && !inbox_text) {
      return res.status(400).json({ error: 'Cần ít nhất nội dung reply comment HOẶC inbox.' });
    }

    // Sanitize keywords
    let keywordsJson = null;
    if (trigger_keywords) {
      const arr = Array.isArray(trigger_keywords)
        ? trigger_keywords.filter((k) => k && k.trim())
        : typeof trigger_keywords === 'string'
          ? trigger_keywords.split(',').map((k) => k.trim()).filter(Boolean)
          : null;
      if (arr && arr.length > 0) {
        keywordsJson = JSON.stringify(arr);
      }
    }

    const db = getDB();
    const result = await db.run(
      'INSERT INTO CommentRules (shop_id, post_id, trigger_keywords, reply_text, inbox_text, auto_hide) VALUES (?, ?, ?, ?, ?, ?)',
      [
        req.shop.shopId,
        (post_id || 'ALL').trim(),
        keywordsJson,
        reply_text || null,
        inbox_text || null,
        auto_hide !== undefined ? (auto_hide ? 1 : 0) : 1,
      ]
    );

    console.log(`[COMMENT RULES] Tạo rule #${result.lastID}: post=${post_id || 'ALL'}, keywords=${keywordsJson || 'ALL'}`);

    res.status(201).json({
      id: result.lastID,
      shop_id: req.shop.shopId,
      post_id: (post_id || 'ALL').trim(),
      trigger_keywords: keywordsJson ? JSON.parse(keywordsJson) : null,
      reply_text: reply_text || null,
      inbox_text: inbox_text || null,
      auto_hide: auto_hide !== undefined ? (auto_hide ? 1 : 0) : 1,
      is_active: 1,
    });
  } catch (error) {
    console.error('[COMMENT RULES] POST error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PUT /api/comment-rules/:id — Cập nhật luật */
router.put('/:id', async (req, res) => {
  try {
    const { post_id, trigger_keywords, reply_text, inbox_text, auto_hide, is_active } = req.body;
    const db = getDB();

    const fields = [];
    const values = [];

    if (post_id !== undefined) { fields.push('post_id = ?'); values.push(post_id.trim()); }
    if (reply_text !== undefined) { fields.push('reply_text = ?'); values.push(reply_text); }
    if (inbox_text !== undefined) { fields.push('inbox_text = ?'); values.push(inbox_text); }
    if (auto_hide !== undefined) { fields.push('auto_hide = ?'); values.push(auto_hide ? 1 : 0); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (trigger_keywords !== undefined) {
      if (trigger_keywords === null || (Array.isArray(trigger_keywords) && trigger_keywords.length === 0)) {
        fields.push('trigger_keywords = NULL');
      } else {
        const arr = Array.isArray(trigger_keywords)
          ? trigger_keywords.filter((k) => k && k.trim())
          : typeof trigger_keywords === 'string'
            ? trigger_keywords.split(',').map((k) => k.trim()).filter(Boolean)
            : [];
        fields.push('trigger_keywords = ?');
        values.push(arr.length > 0 ? JSON.stringify(arr) : null);
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Không có gì để cập nhật.' });

    values.push(req.params.id, req.shop.shopId);
    await db.run(`UPDATE CommentRules SET ${fields.join(', ')} WHERE id = ? AND shop_id = ?`, values);

    res.json({ message: 'Đã cập nhật.' });
  } catch (error) {
    console.error('[COMMENT RULES] PUT error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** DELETE /api/comment-rules/:id — Xóa luật */
router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    await db.run('DELETE FROM CommentRules WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    res.json({ message: 'Đã xóa.' });
  } catch (error) {
    console.error('[COMMENT RULES] DELETE error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
