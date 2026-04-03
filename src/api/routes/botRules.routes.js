'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

/** GET /api/bot-rules — Danh sách kịch bản */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const rules = await db.all('SELECT * FROM BotRules WHERE shop_id = ? ORDER BY created_at DESC', [req.shop.shopId]);

    // Parse steps JSON for each rule
    const parsed = rules.map((rule) => ({
      ...rule,
      steps: rule.steps ? JSON.parse(rule.steps) : null,
    }));

    res.json(parsed);
  } catch (error) {
    console.error('[BOT RULES] GET error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/bot-rules — Tạo kịch bản mới (hỗ trợ cả single-response và multi-step) */
router.post('/', async (req, res) => {
  try {
    const { keywords, response, match_type, response_type, media_url, steps } = req.body;
    if (!keywords) return res.status(400).json({ error: 'keywords là bắt buộc.' });

    // Validate: phải có ít nhất response HOẶC steps
    if (!response && (!steps || !Array.isArray(steps) || steps.length === 0)) {
      return res.status(400).json({ error: 'Cần ít nhất 1 bước tin nhắn (steps) hoặc nội dung trả lời (response).' });
    }

    // Validate steps structure
    let stepsJson = null;
    if (steps && Array.isArray(steps) && steps.length > 0) {
      // Sanitize: giới hạn delay_seconds tối đa 15s, lọc step rỗng
      const sanitized = steps
        .filter((s) => (s.text && s.text.trim()) || (s.media_urls && s.media_urls.length > 0))
        .map((s, idx) => ({
          id: s.id || `s${idx + 1}`,
          text: (s.text || '').trim(),
          media_urls: Array.isArray(s.media_urls) ? s.media_urls.filter(Boolean) : [],
          delay_seconds: Math.min(Math.max(Number(s.delay_seconds) || 0, 0), 15),
        }));

      if (sanitized.length === 0) {
        return res.status(400).json({ error: 'Mỗi bước phải có nội dung text hoặc ảnh.' });
      }
      stepsJson = JSON.stringify(sanitized);
    }

    // Auto-generate response text from first step (for backward compat + display)
    const effectiveResponse = response || (steps?.[0]?.text) || '[Multi-step Script]';

    const db = getDB();
    const result = await db.run(
      'INSERT INTO BotRules (shop_id, keywords, response, response_type, media_url, match_type, steps) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.shop.shopId, keywords, effectiveResponse, response_type || 'text', media_url || null, match_type || 'contains', stepsJson]
    );

    console.log(`[BOT RULES] Tạo rule #${result.lastID}: "${keywords}" → ${stepsJson ? `${JSON.parse(stepsJson).length} steps` : `type:${response_type || 'text'}`}`);

    res.status(201).json({
      id: result.lastID,
      keywords,
      response: effectiveResponse,
      response_type: response_type || 'text',
      media_url: media_url || null,
      match_type: match_type || 'contains',
      steps: stepsJson ? JSON.parse(stepsJson) : null,
      is_active: 1,
    });
  } catch (error) {
    console.error('[BOT RULES] POST error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PUT /api/bot-rules/:id — Cập nhật */
router.put('/:id', async (req, res) => {
  try {
    const { keywords, response, match_type, response_type, media_url, is_active, steps } = req.body;
    const db = getDB();

    // Build dynamic update
    const fields = [];
    const values = [];

    if (keywords !== undefined) { fields.push('keywords = ?'); values.push(keywords); }
    if (response !== undefined) { fields.push('response = ?'); values.push(response); }
    if (response_type !== undefined) { fields.push('response_type = ?'); values.push(response_type); }
    if (media_url !== undefined) { fields.push('media_url = ?'); values.push(media_url); }
    if (match_type !== undefined) { fields.push('match_type = ?'); values.push(match_type); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active); }

    if (steps !== undefined) {
      if (steps === null) {
        fields.push('steps = NULL');
      } else if (Array.isArray(steps)) {
        const sanitized = steps
          .filter((s) => (s.text && s.text.trim()) || (s.media_urls && s.media_urls.length > 0))
          .map((s, idx) => ({
            id: s.id || `s${idx + 1}`,
            text: (s.text || '').trim(),
            media_urls: Array.isArray(s.media_urls) ? s.media_urls.filter(Boolean) : [],
            delay_seconds: Math.min(Math.max(Number(s.delay_seconds) || 0, 0), 15),
          }));
        fields.push('steps = ?');
        values.push(JSON.stringify(sanitized));

        // Auto-update response for display
        if (sanitized.length > 0 && !response) {
          fields.push('response = ?');
          values.push(sanitized[0].text || '[Multi-step Script]');
        }
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Không có gì để cập nhật.' });

    values.push(req.params.id, req.shop.shopId);
    await db.run(`UPDATE BotRules SET ${fields.join(', ')} WHERE id = ? AND shop_id = ?`, values);

    res.json({ message: 'Đã cập nhật.' });
  } catch (error) {
    console.error('[BOT RULES] PUT error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** DELETE /api/bot-rules/:id — Xóa */
router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    await db.run('DELETE FROM BotRules WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    res.json({ message: 'Đã xóa.' });
  } catch (error) {
    console.error('[BOT RULES] DELETE error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
