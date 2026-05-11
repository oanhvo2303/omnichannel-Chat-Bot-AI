'use strict';
const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');

const router = express.Router();
router.use(authMiddleware);

const VALID_TAGS = [
  'CONFIRMED_EVENT_UPDATE',
  'POST_PURCHASE_UPDATE',
  'ACCOUNT_UPDATE',
];

/** GET /api/followup/settings — Trả về toàn bộ cài đặt follow-up + remarketing */
router.get('/settings', async (req, res) => {
  try {
    const db = getDB();
    const shop = await db.get(
      `SELECT followup_enabled, followup_delay_minutes, followup_message,
              remarketing_enabled, remarketing_interval_min, remarketing_interval_max,
              remarketing_templates, remarketing_max_cycles, remarketing_max_days,
              remarketing_message_tag
       FROM Shops WHERE id = ?`,
      [req.shop.shopId]
    );

    let templates = [];
    try { templates = JSON.parse(shop?.remarketing_templates || '[]'); } catch { templates = []; }

    res.json({
      // Phase 1
      enabled: shop?.followup_enabled === 1,
      delay_minutes: shop?.followup_delay_minutes || 10,
      message: shop?.followup_message || '',
      // Phase 2
      remarketing_enabled: shop?.remarketing_enabled === 1,
      remarketing_interval_min: shop?.remarketing_interval_min || 12,
      remarketing_interval_max: shop?.remarketing_interval_max || 23,
      remarketing_templates: templates,
      remarketing_max_cycles: shop?.remarketing_max_cycles || 30,
      remarketing_max_days: shop?.remarketing_max_days || 30,
      remarketing_message_tag: shop?.remarketing_message_tag || 'CONFIRMED_EVENT_UPDATE',
    });
  } catch (err) {
    console.error('[FOLLOWUP SETTINGS] Lỗi GET:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PUT /api/followup/settings — Lưu toàn bộ cài đặt */
router.put('/settings', requireOwnerOrAdmin, async (req, res) => {
  try {
    const {
      enabled, delay_minutes, message,
      remarketing_enabled, remarketing_interval_min, remarketing_interval_max,
      remarketing_templates, remarketing_max_cycles, remarketing_max_days,
      remarketing_message_tag,
    } = req.body;

    // ── Validate Phase 1 ──────────────────────────────
    const delay = Number(delay_minutes);
    if (isNaN(delay) || delay < 1 || delay > 1440) {
      return res.status(400).json({ error: 'Thời gian chờ phải từ 1–1440 phút.' });
    }
    if (enabled && (!message || message.trim().length < 5)) {
      return res.status(400).json({ error: 'Tin nhắn hỏi lại Phase 1 không được để trống.' });
    }

    // ── Validate Phase 2 ──────────────────────────────
    const intMin = Number(remarketing_interval_min);
    const intMax = Number(remarketing_interval_max);
    if (isNaN(intMin) || intMin < 1 || isNaN(intMax) || intMax < intMin) {
      return res.status(400).json({ error: 'Khoảng thời gian remarketing không hợp lệ.' });
    }
    const maxCycles = Number(remarketing_max_cycles);
    const maxDays = Number(remarketing_max_days);
    if (isNaN(maxCycles) || maxCycles < 1 || isNaN(maxDays) || maxDays < 1) {
      return res.status(400).json({ error: 'Giới hạn lần gửi/ngày phải lớn hơn 0.' });
    }
    if (remarketing_enabled && (!Array.isArray(remarketing_templates) || remarketing_templates.length === 0)) {
      return res.status(400).json({ error: 'Vui lòng thêm ít nhất 1 mẫu tin nhắn remarketing.' });
    }
    const tag = remarketing_message_tag || 'CONFIRMED_EVENT_UPDATE';
    if (!VALID_TAGS.includes(tag)) {
      return res.status(400).json({ error: 'Message tag không hợp lệ.' });
    }

    // Sanitize templates — loại bỏ tin trống
    const cleanTemplates = (remarketing_templates || [])
      .map(t => (t || '').trim())
      .filter(t => t.length >= 5);

    const db = getDB();
    await db.run(
      `UPDATE Shops SET
        followup_enabled = ?, followup_delay_minutes = ?, followup_message = ?,
        remarketing_enabled = ?, remarketing_interval_min = ?, remarketing_interval_max = ?,
        remarketing_templates = ?, remarketing_max_cycles = ?, remarketing_max_days = ?,
        remarketing_message_tag = ?
       WHERE id = ?`,
      [
        enabled ? 1 : 0, delay, message?.trim() || '',
        remarketing_enabled ? 1 : 0, intMin, intMax,
        JSON.stringify(cleanTemplates), maxCycles, maxDays,
        tag,
        req.shop.shopId,
      ]
    );
    res.json({ message: 'Đã lưu cài đặt remarketing.' });
  } catch (err) {
    console.error('[FOLLOWUP SETTINGS] Lỗi PUT:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
