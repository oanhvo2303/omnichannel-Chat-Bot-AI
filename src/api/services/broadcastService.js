'use strict';

const { getDB } = require('../../infra/database/sqliteConnection');
const { getIO } = require('../../infra/socket/socketManager');

/**
 * Broadcast Service — Gửi tin nhắn hàng loạt với delay chống spam
 *
 * FIX: io.to(shopId).emit() thay vì io.emit() toàn hệ thống → tenant isolation.
 * FIX: Lấy page_access_token từ ShopIntegrations (multi-page) thay vì Shops.page_access_token legacy.
 *
 * Delay: 1-2 giây giữa mỗi tin nhắn
 * Facebook rate limit: ~200 messages/hour cho Page bình thường
 */

const DELAY_MS = 1500; // 1.5s giữa mỗi tin

/**
 * Helper emit an toàn theo room của shop.
 * Không bao giờ phát toàn hệ thống.
 */
function emitToShop(io, shopId, event, data) {
  if (!io) return;
  io.to(String(shopId)).emit(event, data);
}

/**
 * Lấy danh sách khách hàng theo tag filter
 */
async function getRecipients(shopId, tagIds) {
  const db = getDB();

  if (!tagIds || tagIds.length === 0) {
    return db.all(
      'SELECT id, platform_id, platform, name FROM Customers WHERE shop_id = ? AND platform_id IS NOT NULL',
      [shopId]
    );
  }

  const placeholders = tagIds.map(() => '?').join(',');
  return db.all(`
    SELECT DISTINCT c.id, c.platform_id, c.platform, c.name
    FROM Customers c
    INNER JOIN CustomerTags ct ON c.id = ct.customer_id
    WHERE c.shop_id = ? AND ct.tag_id IN (${placeholders}) AND c.platform_id IS NOT NULL
  `, [shopId, ...tagIds]);
}

/**
 * Lấy map { pageId → pageAccessToken } từ ShopIntegrations cho shop.
 *
 * FIX: Thay vì dùng Shops.page_access_token (1 token duy nhất, legacy),
 * ta lấy tất cả các page tokens → gửi đúng token cho đúng page.
 *
 * @returns {Map<string, string>} pageId → access_token
 */
async function getPageTokenMap(shopId) {
  const db = getDB();
  const rows = await db.all(
    `SELECT page_id, access_token
     FROM ShopIntegrations
     WHERE shop_id = ? AND platform LIKE 'facebook_%' AND status = 'connected' AND page_id IS NOT NULL`,
    [shopId]
  );

  const map = new Map();
  for (const row of rows) {
    if (row.page_id && row.access_token) {
      map.set(String(row.page_id), row.access_token);
    }
  }

  // Fallback: nếu không có gì trong ShopIntegrations, thử lấy legacy token từ Shops
  if (map.size === 0) {
    const shop = await db.get(
      'SELECT facebook_page_id, page_access_token FROM Shops WHERE id = ?',
      [shopId]
    );
    if (shop?.facebook_page_id && shop?.page_access_token) {
      console.warn(`[BROADCAST] ⚠️ Shop #${shopId} dùng fallback legacy token từ Shops table.`);
      map.set(String(shop.facebook_page_id), shop.page_access_token);
    }
  }

  return map;
}

/**
 * Xác định page token phù hợp cho một recipient.
 *
 * Chiến lược: Nếu customer thuộc page cụ thể (platform_page_id có),
 * dùng token của page đó. Nếu không, dùng token đầu tiên available.
 *
 * @param {Map} pageTokenMap
 * @param {object} recipient — { platform_id, platform_page_id? }
 * @returns {string|null}
 */
function resolvePageToken(pageTokenMap, recipient) {
  // Nếu customer có gắn page_id cụ thể
  if (recipient.platform_page_id && pageTokenMap.has(String(recipient.platform_page_id))) {
    return pageTokenMap.get(String(recipient.platform_page_id));
  }
  // Fallback: lấy token đầu tiên trong map
  if (pageTokenMap.size > 0) {
    return pageTokenMap.values().next().value;
  }
  return null;
}

/**
 * Gửi tin nhắn qua Facebook (text + optional image)
 */
async function sendFacebookBroadcast(recipientId, text, imageUrl, pageAccessToken) {
  if (!pageAccessToken) return { success: false, error: 'No page access token' };

  const messages = [];

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

  messages.push({
    recipient: { id: recipientId },
    message: { text },
  });

  for (const payload of messages) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Unknown FB error' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: true };
}

/**
 * Background worker: xử lý broadcast
 *
 * FIX 1: Dùng io.to(shopId).emit() — không bao giờ leak sang shop khác.
 * FIX 2: Lấy token per-page từ ShopIntegrations.
 */
async function processBroadcast(broadcastId) {
  const db = getDB();
  const io = getIO();

  const broadcast = await db.get('SELECT * FROM Broadcasts WHERE id = ?', [broadcastId]);
  if (!broadcast) return;

  const shopId = broadcast.shop_id;

  // FIX: Lấy map token từ ShopIntegrations (multi-page) thay vì Shops.page_access_token
  const pageTokenMap = await getPageTokenMap(shopId);

  if (pageTokenMap.size === 0) {
    console.error(`[BROADCAST] ❌ Shop #${shopId} không có page token nào. Hủy chiến dịch #${broadcastId}.`);
    await db.run(
      "UPDATE Broadcasts SET status = 'failed' WHERE id = ?",
      [broadcastId]
    );
    emitToShop(io, shopId, 'broadcast_progress', {
      id: broadcastId, status: 'failed', total: 0, sent: 0, failed: 0,
      error: 'Không có Facebook Page nào được kết nối.',
    });
    return;
  }

  // Parse tag_ids
  const tagIds = broadcast.tag_ids ? JSON.parse(broadcast.tag_ids) : [];

  // Lấy recipients
  const recipients = await getRecipients(shopId, tagIds);

  // Update total
  await db.run(
    'UPDATE Broadcasts SET status = ?, total = ? WHERE id = ?',
    ['sending', recipients.length, broadcastId]
  );

  // FIX: emit chỉ vào room của shop này
  emitToShop(io, shopId, 'broadcast_progress', {
    id: broadcastId, status: 'sending', total: recipients.length, sent: 0, failed: 0,
  });

  console.log(
    `[BROADCAST] 🚀 Bắt đầu chiến dịch #${broadcastId}: "${broadcast.name}" → ${recipients.length} người (Shop #${shopId})`
  );

  let sent   = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];

    await db.run(
      'INSERT INTO BroadcastLogs (broadcast_id, customer_id, platform_id, status) VALUES (?, ?, ?, ?)',
      [broadcastId, r.id, r.platform_id, 'pending']
    );

    let result = { success: false, error: 'Unsupported platform' };

    if (r.platform === 'facebook') {
      // FIX: Lấy đúng token theo page mà customer thuộc về
      const token = resolvePageToken(pageTokenMap, r);
      if (token) {
        result = await sendFacebookBroadcast(r.platform_id, broadcast.message, broadcast.image_url, token);
      } else {
        result = { success: false, error: 'No matching page token for customer' };
      }
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

    await db.run('UPDATE Broadcasts SET sent = ?, failed = ? WHERE id = ?', [sent, failed, broadcastId]);

    // FIX: emit vào room shop, không phải toàn hệ thống
    if (i % 5 === 0 || i === recipients.length - 1) {
      emitToShop(io, shopId, 'broadcast_progress', {
        id: broadcastId, status: 'sending', total: recipients.length, sent, failed,
      });
    }

    console.log(
      `[BROADCAST] ${i + 1}/${recipients.length} | ${r.name || r.platform_id} → ${result.success ? '✅' : '❌ ' + result.error}`
    );

    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  const finalStatus = failed === recipients.length ? 'failed' : 'completed';
  await db.run(
    'UPDATE Broadcasts SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
    [finalStatus, broadcastId]
  );

  // FIX: emit vào room shop
  emitToShop(io, shopId, 'broadcast_progress', {
    id: broadcastId, status: finalStatus, total: recipients.length, sent, failed,
  });

  console.log(
    `[BROADCAST] ✅ Hoàn tất #${broadcastId}: ${sent} gửi, ${failed} lỗi / ${recipients.length} tổng (Shop #${shopId})`
  );
}

module.exports = { processBroadcast, getRecipients };
