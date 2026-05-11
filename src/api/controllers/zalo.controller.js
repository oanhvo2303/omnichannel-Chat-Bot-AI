'use strict';

const { analyzeCustomerMessage } = require('../../services/ai/geminiService');
const { getDB } = require('../../infra/database/sqliteConnection');
const { getIO } = require('../../infra/socket/socketManager');

/**
 * Zalo OA Webhook Controller (Multi-tenant)
 *
 * Zalo OA gửi event dạng:
 * {
 *   "app_id": "...",
 *   "user_id_by_app": "...",
 *   "sender": { "id": "zalo_user_id" },
 *   "message": { "text": "Nội dung" },
 *   "event_name": "user_send_text",
 *   "timestamp": "..."
 * }
 */

/**
 * GET /webhook/zalo — Verification (Zalo chỉ cần trả 200)
 */
const verifyZaloWebhook = (req, res) => {
  console.log('[ZALO WEBHOOK] Verification request received.');
  res.status(200).json({ status: 'ok' });
};

/**
 * Gửi tin nhắn qua Zalo OA Send Message API
 */
const sendZaloMessage = async (userId, text, accessToken) => {
  if (!accessToken) {
    console.error('[ZALO SEND] Không có OA Access Token.');
    return;
  }

  try {
    const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: accessToken,
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text },
      }),
    });

    const data = await response.json();
    if (data.error !== 0) {
      console.error('[ZALO SEND] Lỗi:', data.message);
    } else {
      console.log(`[ZALO SEND] Trả lời thành công user ${userId}`);
    }
  } catch (error) {
    console.error('[ZALO SEND] Network error:', error.message);
  }
};

/**
 * POST /webhook/zalo — Nhận event từ Zalo OA
 */
const handleZaloEvent = (req, res) => {
  const body = req.body;
  res.status(200).json({ status: 'EVENT_RECEIVED' });

  const eventName = body.event_name;
  if (eventName !== 'user_send_text') {
    console.log(`[ZALO WEBHOOK] Non-text event: ${eventName}`);
    return;
  }

  const senderId = body.sender?.id;
  const messageText = body.message?.text;
  const appId = body.app_id;

  if (!senderId || !messageText) return;

  console.log(`[ZALO WEBHOOK] App ${appId} | From ${senderId}: "${messageText}"`);

  (async () => {
    try {
      const db = getDB();
      const io = getIO();

      // Tìm Shop qua zalo_oa_id (app_id)
      const shop = await db.get(
        'SELECT id, zalo_access_token FROM Shops WHERE zalo_oa_id = ?',
        [appId]
      );

      if (!shop) {
        console.warn(`[ZALO] Không tìm thấy Shop cho OA ID: ${appId}. Bỏ qua.`);
        return;
      }

      const shopId = shop.id;

      // Upsert Customer
      await db.run(
        'INSERT OR IGNORE INTO Customers (shop_id, platform_id, platform) VALUES (?, ?, ?)',
        [shopId, senderId, 'zalo']
      );
      const customer = await db.get(
        'SELECT id FROM Customers WHERE shop_id = ? AND platform_id = ? AND platform = ?',
        [shopId, senderId, 'zalo']
      );
      if (!customer) return;

      // Lưu tin nhắn khách
      const msgResult = await db.run(
        'INSERT INTO Messages (shop_id, customer_id, sender, text) VALUES (?, ?, ?, ?)',
        [shopId, customer.id, 'customer', messageText]
      );

      if (io) {
        // FIX: emit chỉ vào room của shop này — không leak sang tenant khác
        io.to(String(shopId)).emit('new_message', {
          id: msgResult.lastID, shop_id: shopId, customer_id: customer.id,
          sender: 'customer', text: messageText, intent: null, timestamp: new Date().toISOString(),
        });
      }

      // AI phân tích
      const analysis = await analyzeCustomerMessage(messageText);

      // Lưu reply bot
      const botResult = await db.run(
        'INSERT INTO Messages (shop_id, customer_id, sender, text, intent) VALUES (?, ?, ?, ?, ?)',
        [shopId, customer.id, 'bot', analysis.reply, analysis.intent]
      );

      if (io) {
        // FIX: emit chỉ vào room của shop này
        io.to(String(shopId)).emit('new_message', {
          id: botResult.lastID, shop_id: shopId, customer_id: customer.id,
          sender: 'bot', text: analysis.reply, intent: analysis.intent, timestamp: new Date().toISOString(),
        });
      }

      // Gửi reply qua Zalo
      await sendZaloMessage(senderId, analysis.reply, shop.zalo_access_token);

    } catch (error) {
      console.error('[ZALO PIPELINE] Lỗi:', error.message);
    }
  })();
};

module.exports = { verifyZaloWebhook, handleZaloEvent };
