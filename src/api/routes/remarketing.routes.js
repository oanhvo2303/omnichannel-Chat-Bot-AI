'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireMarketingPermission } = require('../middlewares/roleMiddleware');
const { getRecipients } = require('../services/broadcastService');
const { getIO } = require('../../infra/socket/socketManager');
const { writeAudit, getClientIp } = require('../services/auditService');
const { enqueue } = require('../../services/queue/queueWorker');

const router = express.Router();
router.use(authMiddleware);

const DELAY_MS = 2500; // 2.5 giây giữa mỗi tin (chống spam Facebook)

/**
 * GET /api/remarketing/preview
 * Đếm số khách hàng sẽ nhận tin (preview trước khi gửi)
 */
router.get('/preview', async (req, res) => {
  try {
    const tagIds = req.query.tags ? req.query.tags.split(',').map(Number) : [];
    const recipients = await getRecipients(req.shop.shopId, tagIds);
    res.json({ total: recipients.length });
  } catch (error) {
    console.error('[REMARKETING] Lỗi preview:', error.message);
    res.status(500).json({ error: 'Lỗi đếm đối tượng.' });
  }
});

/**
 * POST /api/remarketing/send
 * Gửi tin nhắn re-marketing hàng loạt.
 * Body: { message, image_url?, tag_ids? }
 * message hỗ trợ biến {{name}} → thay bằng tên khách hàng.
 *
 * Fire-and-forget: Trả response ngay, worker chạy ngầm.
 * Emit progress qua Socket.IO event "remarketing_progress"
 */
router.post('/send', requireMarketingPermission, async (req, res) => {
  try {
    const { message, image_url, tag_ids } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Nội dung tin nhắn là bắt buộc.' });
    }

    const db = getDB();
    const shopId = req.shop.shopId;

    // Lấy danh sách người nhận
    const recipients = await getRecipients(shopId, tag_ids || []);
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'Không tìm thấy khách hàng nào thỏa mãn điều kiện.' });
    }

    // FIX: Dùng pageTokenMap thay vì LIMIT 1 — gửi đúng token cho đúng page
    const { getPageTokenMap, resolvePageToken } = require('../services/broadcastService');
    const pageTokenMap = await getPageTokenMap(shopId);

    if (pageTokenMap.size === 0) {
      return res.status(400).json({ error: 'Chưa kết nối Facebook Fanpage. Vui lòng vào Kết nối Đa kênh.' });
    }

    // Lưu campaign
    const campaign = await db.run(
      `INSERT INTO Broadcasts (shop_id, name, message, image_url, tag_ids, total, status)
       VALUES (?, ?, ?, ?, ?, ?, 'sending')`,
      [shopId, `Remarketing ${new Date().toLocaleDateString('vi-VN')}`, message, image_url || null,
       tag_ids ? JSON.stringify(tag_ids) : null, recipients.length]
    );

    const campaignId = campaign.lastID;

    // ✅ Enqueue vào persistent queue — không còn fire-and-forget
    // QueueWorker sẽ xử lý với retry tự động nếu FB API timeout
    await enqueue(shopId, 'remarketing', {
      campaignId,
      shopId,
      message,
      image_url: image_url || null,
      recipients,
      pageTokenMap: [...pageTokenMap.entries()], // Serialize Map → Array để lưu JSON
    });

    // Audit
    writeAudit({ shopId, actorId: req.shop.staffId, actorRole: req.shop.role,
      action: 'SEND_REMARKETING', resource: 'Broadcasts', resourceId: campaignId,
      detail: { total: recipients.length }, ip: getClientIp(req) });

    res.json({
      id: campaignId,
      message: `Đã xếp hàng gửi cho ${recipients.length} khách. Hệ thống sẽ gửi lần lượt.`,
      total: recipients.length,
      status: 'pending',
    });
  } catch (error) {
    console.error('[REMARKETING] Lỗi send:', error.message);
    res.status(500).json({ error: 'Lỗi hệ thống.' });
  }
});

/**
 * GET /api/remarketing/history
 * Lịch sử các chiến dịch remarketing
 */
router.get('/history', async (req, res) => {
  try {
    const db = getDB();
    const campaigns = await db.all(
      "SELECT id, name, message, total, sent, failed, status, created_at, completed_at FROM Broadcasts WHERE shop_id = ? ORDER BY created_at DESC LIMIT 20",
      [req.shop.shopId]
    );
    res.json({ campaigns });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi tải lịch sử.' });
  }
});

module.exports = router;
