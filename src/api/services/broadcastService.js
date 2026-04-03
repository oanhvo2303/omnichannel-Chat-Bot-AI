'use strict';

const { getDB } = require('../../infra/database/sqliteConnection');
const { getIO } = require('../../infra/socket/socketManager');

/**
 * Broadcast Service — Gửi tin nhắn hàng loạt với delay chống spam
 *
 * Delay: 1-2 giây giữa mỗi tin nhắn
 * Facebook rate limit: ~200 messages/hour cho Page bình thường
 */

const DELAY_MS = 1500; // 1.5s giữa mỗi tin

/**
 * Lấy danh sách khách hàng theo tag filter
 */
async function getRecipients(shopId, tagIds) {
  const db = getDB();

  if (!tagIds || tagIds.length === 0) {
    // Gửi tất cả khách có platform_id (Facebook)
    return db.all(
      'SELECT id, platform_id, platform, name FROM Customers WHERE shop_id = ? AND platform_id IS NOT NULL',
      [shopId]
    );
  }

  // Lọc theo tags
  const placeholders = tagIds.map(() => '?').join(',');
  return db.all(`
    SELECT DISTINCT c.id, c.platform_id, c.platform, c.name
    FROM Customers c
    INNER JOIN CustomerTags ct ON c.id = ct.customer_id
    WHERE c.shop_id = ? AND ct.tag_id IN (${placeholders}) AND c.platform_id IS NOT NULL
  `, [shopId, ...tagIds]);
}

/**
 * Gửi tin nhắn qua Facebook (text + optional image)
 */
async function sendFacebookBroadcast(recipientId, text, imageUrl, pageAccessToken) {
  if (!pageAccessToken) return { success: false, error: 'No token' };

  const messages = [];

  // Gửi ảnh trước (nếu có)
  if (imageUrl) {
    messages.push({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: imageUrl, is_reusable: true },
        },
      },
    });
  }

  // Gửi text
  messages.push({
    recipient: { id: recipientId },
    message: { text },
  });

  for (const payload of messages) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Unknown error' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: true };
}

/**
 * Background worker: xử lý broadcast
 * Chạy async, emit progress qua Socket.IO
 */
async function processBroadcast(broadcastId) {
  const db = getDB();
  const io = getIO();

  const broadcast = await db.get('SELECT * FROM Broadcasts WHERE id = ?', [broadcastId]);
  if (!broadcast) return;

  const shop = await db.get('SELECT page_access_token FROM Shops WHERE id = ?', [broadcast.shop_id]);
  const pageToken = shop?.page_access_token;

  // Parse tag_ids
  const tagIds = broadcast.tag_ids ? JSON.parse(broadcast.tag_ids) : [];

  // Lấy recipients
  const recipients = await getRecipients(broadcast.shop_id, tagIds);

  // Update total
  await db.run('UPDATE Broadcasts SET status = ?, total = ? WHERE id = ?', ['sending', recipients.length, broadcastId]);

  if (io) io.emit('broadcast_progress', { id: broadcastId, status: 'sending', total: recipients.length, sent: 0, failed: 0 });

  console.log(`[BROADCAST] 🚀 Bắt đầu gửi chiến dịch #${broadcastId}: "${broadcast.name}" → ${recipients.length} người`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];

    // Insert log
    await db.run(
      'INSERT INTO BroadcastLogs (broadcast_id, customer_id, platform_id, status) VALUES (?, ?, ?, ?)',
      [broadcastId, r.id, r.platform_id, 'pending']
    );

    let result = { success: false, error: 'Unsupported platform' };

    if (r.platform === 'facebook' && pageToken) {
      result = await sendFacebookBroadcast(r.platform_id, broadcast.message, broadcast.image_url, pageToken);
    }

    if (result.success) {
      sent++;
      await db.run(
        "UPDATE BroadcastLogs SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE broadcast_id = ? AND customer_id = ?",
        [broadcastId, r.id]
      );
    } else {
      failed++;
      await db.run(
        "UPDATE BroadcastLogs SET status = 'failed', error = ? WHERE broadcast_id = ? AND customer_id = ?",
        [result.error, broadcastId, r.id]
      );
    }

    // Update progress
    await db.run('UPDATE Broadcasts SET sent = ?, failed = ? WHERE id = ?', [sent, failed, broadcastId]);

    // Emit real-time progress
    if (io && (i % 5 === 0 || i === recipients.length - 1)) {
      io.emit('broadcast_progress', { id: broadcastId, status: 'sending', total: recipients.length, sent, failed });
    }

    console.log(`[BROADCAST] ${i + 1}/${recipients.length} | ${r.name || r.platform_id} → ${result.success ? '✅' : '❌ ' + result.error}`);

    // Delay chống spam (trừ tin cuối)
    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  // Hoàn tất
  const finalStatus = failed === recipients.length ? 'failed' : 'completed';
  await db.run('UPDATE Broadcasts SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', [finalStatus, broadcastId]);

  if (io) io.emit('broadcast_progress', { id: broadcastId, status: finalStatus, total: recipients.length, sent, failed });

  console.log(`[BROADCAST] ✅ Hoàn tất #${broadcastId}: ${sent} gửi, ${failed} lỗi / ${recipients.length} tổng`);
}

module.exports = { processBroadcast, getRecipients };
