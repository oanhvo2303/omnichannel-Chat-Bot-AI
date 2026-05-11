'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/faq?sort=newest|oldest
 * Lấy danh sách FAQ của shop (tất cả staff đều đọc được)
 */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const { sort = 'newest' } = req.query;
    const order = sort === 'oldest' ? 'ASC' : 'DESC';

    const faqs = await db.all(
      `SELECT id, question, answer, category, integration_ids, is_active, created_at
       FROM FAQ
       WHERE shop_id = ?
       ORDER BY created_at ${order}`,
      [req.shop.shopId]
    );
    res.json(faqs);
  } catch (error) {
    // Bảng chưa tạo → trả mảng rỗng thay vì crash
    if (error.message?.includes('no such table')) {
      return res.json([]);
    }
    console.error('[FAQ] Lỗi GET:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/faq — Thêm FAQ mới (owner/admin only)
 */
router.post('/', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { question, answer, category, integration_ids } = req.body;
    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({ error: 'Câu hỏi và câu trả lời là bắt buộc.' });
    }

    const db = getDB();
    const idsJson = Array.isArray(integration_ids) && integration_ids.length > 0
      ? JSON.stringify(integration_ids.map(String))
      : null;

    const result = await db.run(
      `INSERT INTO FAQ (shop_id, question, answer, category, integration_ids, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [req.shop.shopId, question.trim(), answer.trim(), category?.trim() || null, idsJson]
    );

    console.log(`[FAQ] Shop #${req.shop.shopId} thêm FAQ #${result.lastID}: "${question.substring(0, 50)}"`);
    res.status(201).json({
      id: result.lastID,
      question: question.trim(),
      answer: answer.trim(),
      category: category?.trim() || null,
      integration_ids: idsJson,
      is_active: 1,
    });
  } catch (error) {
    console.error('[FAQ] Lỗi POST:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /api/faq/:id — Cập nhật FAQ (owner/admin only)
 */
router.put('/:id', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { question, answer, category, integration_ids } = req.body;
    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({ error: 'Câu hỏi và câu trả lời là bắt buộc.' });
    }

    const db = getDB();
    const faq = await db.get('SELECT id FROM FAQ WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    if (!faq) return res.status(404).json({ error: 'FAQ không tồn tại.' });

    const idsJson = Array.isArray(integration_ids) && integration_ids.length > 0
      ? JSON.stringify(integration_ids.map(String))
      : null;

    await db.run(
      `UPDATE FAQ SET question = ?, answer = ?, category = ?, integration_ids = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND shop_id = ?`,
      [question.trim(), answer.trim(), category?.trim() || null, idsJson, req.params.id, req.shop.shopId]
    );

    res.json({ success: true, message: 'Đã cập nhật FAQ.' });
  } catch (error) {
    console.error('[FAQ] Lỗi PUT:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PATCH /api/faq/:id/toggle — Bật/tắt FAQ (owner/admin only)
 */
router.patch('/:id/toggle', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const faq = await db.get('SELECT id, is_active FROM FAQ WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    if (!faq) return res.status(404).json({ error: 'FAQ không tồn tại.' });

    const newState = faq.is_active ? 0 : 1;
    await db.run('UPDATE FAQ SET is_active = ? WHERE id = ?', [newState, faq.id]);
    res.json({ success: true, is_active: newState });
  } catch (error) {
    console.error('[FAQ] Lỗi TOGGLE:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /api/faq/:id — Xóa FAQ (owner/admin only)
 */
router.delete('/:id', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const faq = await db.get('SELECT id FROM FAQ WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    if (!faq) return res.status(404).json({ error: 'FAQ không tồn tại.' });

    await db.run('DELETE FROM FAQ WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    res.json({ success: true });
  } catch (error) {
    console.error('[FAQ] Lỗi DELETE:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
