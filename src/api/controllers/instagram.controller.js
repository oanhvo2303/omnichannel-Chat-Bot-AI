'use strict';

const { analyzeCustomerMessage } = require('../../services/ai/geminiService');
const { getDB } = require('../../infra/database/sqliteConnection');
const { getIO } = require('../../infra/socket/socketManager');

/**
 * Instagram Webhook Controller (Multi-tenant)
 *
 * Instagram Messaging API gửi event tương tự Facebook:
 * {
 *   "object": "instagram",
 *   "entry": [{
 *     "id": "ig_business_account_id",
 *     "messaging": [{
 *       "sender": { "id": "ig_user_id" },
 *       "message": { "text": "Nội dung" }
 *     }]
 *   }]
 * }
 */

/**
 * GET /webhook/instagram — Verification handshake (giống Facebook)
 */
const verifyInstagramWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[IG WEBHOOK] Verification request.');

  if (mode === 'subscribe' && token === (process.env.FB_VERIFY_TOKEN || 'my_verify_token')) {
    console.log('[IG WEBHOOK] Verified OK.');
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'Forbidden' });
};

/**
 * Gửi tin nhắn qua Instagram Send API (dùng Graph API)
 */
const sendInstagramMessage = async (recipientId, text, pageAccessToken) => {
  if (!pageAccessToken) {
    console.error('[IG SEND] Không có Access Token.');
    return;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[IG SEND] Lỗi:', data.error?.message);
    } else {
      console.log(`[IG SEND] Trả lời thành công user ${recipientId}`);
    }
  } catch (error) {
    console.error('[IG SEND] Network error:', error.message);
  }
};

/**
 * POST /webhook/instagram — Nhận event từ Instagram
 */
const handleInstagramEvent = (req, res) => {
  const body = req.body;
  res.status(200).json({ status: 'EVENT_RECEIVED' });

  if (body.object !== 'instagram') {
    console.warn('[IG WEBHOOK] Non-instagram object:', body.object);
    return;
  }

  body.entry?.forEach((entry) => {
    const igAccountId = entry.id;

    entry.messaging?.forEach((event) => {
      const senderId = event.sender?.id;
      const messageText = event.message?.text;

      if (!senderId || !messageText) return;

      console.log(`[IG WEBHOOK] Account ${igAccountId} | From ${senderId}: "${messageText}"`);

      (async () => {
        try {
          const db = getDB();
          const io = getIO();

          // Tìm Shop qua instagram_account_id
          const shop = await db.get(
            'SELECT id, instagram_access_token FROM Shops WHERE instagram_account_id = ?',
            [igAccountId]
          );

          if (!shop) {
            console.warn(`[IG] Không tìm thấy Shop cho IG ID: ${igAccountId}. Bỏ qua.`);
            return;
          }

          const shopId = shop.id;

          // Upsert Customer
          await db.run(
            'INSERT OR IGNORE INTO Customers (shop_id, platform_id, platform) VALUES (?, ?, ?)',
            [shopId, senderId, 'instagram']
          );
          const customer = await db.get(
            'SELECT id FROM Customers WHERE shop_id = ? AND platform_id = ? AND platform = ?',
            [shopId, senderId, 'instagram']
          );
          if (!customer) return;

          // Lưu tin nhắn khách
          const msgResult = await db.run(
            'INSERT INTO Messages (shop_id, customer_id, sender, text) VALUES (?, ?, ?, ?)',
            [shopId, customer.id, 'customer', messageText]
          );

          if (io) {
            io.emit('new_message', {
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
            io.emit('new_message', {
              id: botResult.lastID, shop_id: shopId, customer_id: customer.id,
              sender: 'bot', text: analysis.reply, intent: analysis.intent, timestamp: new Date().toISOString(),
            });
          }

          // Gửi reply qua Instagram
          await sendInstagramMessage(senderId, analysis.reply, shop.instagram_access_token);

        } catch (error) {
          console.error('[IG PIPELINE] Lỗi:', error.message);
        }
      })();
    });
  });
};

module.exports = { verifyInstagramWebhook, handleInstagramEvent };
