'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { getRecipients } = require('../services/broadcastService');
const { getIO } = require('../../infra/socket/socketManager');

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
router.post('/send', async (req, res) => {
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

    // Trả response ngay
    res.json({
      id: campaignId,
      message: 'Đang gửi...',
      total: recipients.length,
      status: 'sending',
    });

    // === BACKGROUND WORKER ===
    (async () => {
      const io = getIO();
      let sent = 0;
      let failed = 0;

      console.log(`[REMARKETING] 🚀 Bắt đầu gửi #${campaignId}: ${recipients.length} khách hàng`);

      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        // Thay biến {{name}} bằng tên khách
        const personalizedMsg = message.replace(/\{\{name\}\}/gi, r.name || 'bạn');

        try {
          // FIX: Lấy token đúng theo page của từng khách
          const pageToken = resolvePageToken(pageTokenMap, r);
          if (!pageToken) {
            failed++;
            console.log(`[REMARKETING] ⚠️ ${r.name || r.platform_id}: không tìm thấy token cho page ${r.page_id}`);
            continue;
          }

          const payload = {
            recipient: { id: r.platform_id },
            message: { text: personalizedMsg },
          };

          const fbRes = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const fbData = await fbRes.json();

          if (fbRes.ok) {
            sent++;
            if (image_url) {
              await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipient: { id: r.platform_id },
                  message: { attachment: { type: 'image', payload: { url: image_url, is_reusable: true } } },
                }),
              });
            }
          } else {
            failed++;
            console.log(`[REMARKETING] ❌ ${r.name || r.platform_id}: ${fbData.error?.message}`);
          }
        } catch (err) {
          failed++;
          console.log(`[REMARKETING] ❌ ${r.name || r.platform_id}: ${err.message}`);
        }

        // Cập nhật DB progress
        await db.run('UPDATE Broadcasts SET sent = ?, failed = ? WHERE id = ?', [sent, failed, campaignId]);

        // FIX: Emit progress chỉ vào room của shop này
        if (io && (i % 3 === 0 || i === recipients.length - 1)) {
          io.to(String(shopId)).emit('remarketing_progress', {
            id: campaignId,
            total: recipients.length,
            sent,
            failed,
            current: i + 1,
            percent: Math.round(((i + 1) / recipients.length) * 100),
          });
        }

        console.log(`[REMARKETING] ${i + 1}/${recipients.length} → ${r.name || r.platform_id}`);

        // Delay 2.5s (trừ tin cuối)
        if (i < recipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }
      }

      // Hoàn tất
      const finalStatus = failed === recipients.length ? 'failed' : 'completed';
      await db.run('UPDATE Broadcasts SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', [finalStatus, campaignId]);

      if (io) {
        // FIX: Room theo shop
        io.to(String(shopId)).emit('remarketing_progress', {
          id: campaignId,
          total: recipients.length,
          sent, failed,
          current: recipients.length,
          percent: 100,
          status: finalStatus,
        });
      }

      console.log(`[REMARKETING] ✅ Hoàn tất #${campaignId}: ${sent} gửi / ${failed} lỗi / ${recipients.length} tổng`);
    })().catch((err) => {
      console.error(`[REMARKETING] Fatal error #${campaignId}:`, err.message);
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
