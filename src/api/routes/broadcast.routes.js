'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { checkPlanLimit } = require('../services/planLimitService');
const { requireOwnerOrAdmin, requireMarketingPermission } = require('../middlewares/roleMiddleware');
const { processBroadcast, getRecipients } = require('../services/broadcastService');
const { writeAudit, getClientIp } = require('../services/auditService');

const router = express.Router();
router.use(authMiddleware);

/** GET /api/broadcasts — Danh sách chiến dịch */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const broadcasts = await db.all(
      'SELECT * FROM Broadcasts WHERE shop_id = ? ORDER BY created_at DESC',
      [req.shop.shopId]
    );
    res.json(broadcasts);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** GET /api/broadcasts/:id — Chi tiết chiến dịch + logs */
router.get('/:id', async (req, res) => {
  try {
    const db = getDB();
    const broadcast = await db.get('SELECT * FROM Broadcasts WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    if (!broadcast) return res.status(404).json({ error: 'Không tìm thấy.' });

    const logs = await db.all(
      `SELECT bl.*, c.name as customer_name FROM BroadcastLogs bl
       LEFT JOIN Customers c ON bl.customer_id = c.id
       WHERE bl.broadcast_id = ? ORDER BY bl.id ASC`,
      [req.params.id]
    );

    res.json({ ...broadcast, logs });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/broadcasts — Tạo chiến dịch mới (marketing permission) */
router.post('/', checkPlanLimit('broadcasts_month'), requireMarketingPermission, async (req, res) => {
  try {
    const { name, message, image_url, tag_ids } = req.body;
    if (!name || !message) return res.status(400).json({ error: 'name và message là bắt buộc.' });

    const db = getDB();
    const shopId = req.shop.shopId;
    const recipients = await getRecipients(shopId, tag_ids || []);

    const result = await db.run(
      'INSERT INTO Broadcasts (shop_id, name, message, image_url, tag_ids, total) VALUES (?, ?, ?, ?, ?, ?)',
      [shopId, name, message, image_url || null, tag_ids ? JSON.stringify(tag_ids) : null, recipients.length]
    );

    console.log(`[BROADCAST] Tạo chiến dịch #${result.lastID}: "${name}" → ${recipients.length} recipients`);

    await writeAudit({
      shopId, actorId: req.shop.staffId, actorRole: req.shop.role,
      action: 'CREATE_BROADCAST', resource: 'Broadcasts', resourceId: result.lastID,
      detail: { name, total: recipients.length }, ip: getClientIp(req),
    });

    res.status(201).json({ id: result.lastID, name, message, image_url, total: recipients.length, status: 'draft' });
  } catch (error) {
    console.error('[BROADCAST] Lỗi tạo:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/broadcasts/:id/send — Bắt đầu gửi (fire-and-forget, marketing permission) */
router.post('/:id/send', requireMarketingPermission, async (req, res) => {
  try {
    const db = getDB();
    const broadcast = await db.get('SELECT * FROM Broadcasts WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    if (!broadcast) return res.status(404).json({ error: 'Không tìm thấy chiến dịch.' });
    if (broadcast.status === 'sending') return res.status(400).json({ error: 'Chiến dịch đang gửi.' });
    if (broadcast.status === 'completed') return res.status(400).json({ error: 'Chiến dịch đã hoàn tất.' });

    await writeAudit({
      shopId: req.shop.shopId, actorId: req.shop.staffId, actorRole: req.shop.role,
      action: 'SEND_BROADCAST', resource: 'Broadcasts', resourceId: broadcast.id,
      detail: { name: broadcast.name, total: broadcast.total }, ip: getClientIp(req),
    });

    res.json({ message: 'Đang bắt đầu gửi...', status: 'sending' });
    processBroadcast(broadcast.id).catch((err) => {
      console.error(`[BROADCAST] Worker error #${broadcast.id}:`, err.message);
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** DELETE /api/broadcasts/:id — Xóa chiến dịch */
router.delete('/:id', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    await db.run('DELETE FROM Broadcasts WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    res.json({ message: 'Đã xóa.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
