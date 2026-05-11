'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/audit — Lấy audit log (chỉ admin/owner)
 * Query params: page, limit, action, actor_id, resource, from, to
 */
router.get('/', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { page = 1, limit = 50, action, actor_id, resource, from, to } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['a.shop_id = ?'];
    const params = [shopId];

    if (action) { conditions.push('a.action = ?'); params.push(action); }
    if (actor_id) { conditions.push('a.actor_id = ?'); params.push(actor_id); }
    if (resource) { conditions.push('a.resource = ?'); params.push(resource); }
    if (from) { conditions.push("a.created_at >= ?"); params.push(from); }
    if (to) { conditions.push("a.created_at <= ?"); params.push(to); }

    const where = conditions.join(' AND ');

    const total = (await db.get(`SELECT COUNT(*) as n FROM AuditLogs a WHERE ${where}`, params))?.n || 0;

    const logs = await db.all(
      `SELECT a.*, s.name as actor_name, s.email as actor_email
       FROM AuditLogs a
       LEFT JOIN Staff s ON a.actor_id = s.id
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    // Parse detail JSON
    for (const log of logs) {
      if (log.detail) {
        try { log.detail = JSON.parse(log.detail); } catch { /* keep as string */ }
      }
    }

    res.json({
      data: logs,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error('[AUDIT] Lỗi lấy audit log:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/audit/actions — Danh sách action types đã có trong log
 */
router.get('/actions', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const actions = await db.all(
      'SELECT DISTINCT action, resource FROM AuditLogs WHERE shop_id = ? ORDER BY action',
      [req.shop.shopId]
    );
    res.json(actions);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
