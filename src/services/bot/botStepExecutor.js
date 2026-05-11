'use strict';

const { getDB } = require('../../infra/database/sqliteConnection');

// =============================================
// Bot Step Executor — Background Async Sequential Messaging
// CRITICAL: Runs AFTER webhook returns 200 OK to Facebook
// Non-blocking sleep via setTimeout promise
// =============================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Detect media type from URL
 */
function detectMediaType(url) {
  const lower = (url || '').toLowerCase();
  if (/\.(mp4|webm|mov|avi|flv)$/.test(lower)) return 'video';
  if (/\.(mp3|aac|ogg|wav)$/.test(lower)) return 'audio';
  return 'image';
}

/**
 * Gửi media (ảnh/video) qua Facebook Attachment API
 * @param {string} recipientId - PSID người nhận
 * @param {string} mediaUrl - URL ảnh hoặc video
 * @param {string} pageAccessToken
 */
async function sendMediaAttachment(recipientId, mediaUrl, pageAccessToken) {
  if (!pageAccessToken || !mediaUrl) return;

  // Facebook không truy cập được localhost → chuyển sang public URL
  let publicUrl = mediaUrl;
  if (mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1')) {
    const publicBase = process.env.PUBLIC_URL || process.env.SITE_URL || '';
    if (publicBase) {
      publicUrl = mediaUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, publicBase);
      console.log(`[BOT STEP] 🔄 Rewrite URL: ${mediaUrl.substring(0, 50)}... → ${publicUrl.substring(0, 50)}...`);
    } else {
      console.warn(`[BOT STEP] ⚠️ Media dùng localhost nhưng chưa set SITE_URL → Facebook sẽ không tải được!`);
    }
  }

  const mediaType = detectMediaType(publicUrl);
  console.log(`[BOT STEP] 📎 Gửi ${mediaType}: ${publicUrl.substring(0, 80)}`);

  try {
    const payload = {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: mediaType,
          payload: { url: publicUrl, is_reusable: true },
        },
      },
    };
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
      console.error(`[BOT STEP] ❌ Lỗi gửi ${mediaType} (HTTP ${res.status}):`, JSON.stringify(data.error));
    } else {
      console.log(`[BOT STEP] ✅ Gửi ${mediaType} OK → PSID ${recipientId}`);
    }
  } catch (err) {
    console.error(`[BOT STEP] ❌ Network error gửi ${mediaType}:`, err.message);
  }
}

/**
 * Gửi text message qua Facebook Send API
 * @param {string} recipientId
 * @param {string} text
 * @param {string} pageAccessToken
 */
async function sendTextMessage(recipientId, text, pageAccessToken) {
  if (!pageAccessToken || !text) return;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error(`[BOT STEP] ❌ Lỗi gửi text:`, data.error?.message);
    } else {
      console.log(`[BOT STEP] 💬 Gửi text → ${recipientId}: "${text.substring(0, 60)}..."`);
    }
  } catch (err) {
    console.error(`[BOT STEP] ❌ Network error gửi text:`, err.message);
  }
}

/**
 * Gửi typing indicator (hiệu ứng "đang nhập...")
 * @param {string} recipientId
 * @param {string} pageAccessToken
 * @param {string} action - 'typing_on' hoặc 'typing_off'
 */
async function sendTypingIndicator(recipientId, pageAccessToken, action = 'typing_on') {
  if (!pageAccessToken) return;
  try {
    await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          sender_action: action,
        }),
      }
    );
  } catch { /* silent — typing indicator không quan trọng */ }
}

/**
 * Thực thi tuần tự các bước tin nhắn của Bot Rule.
 * CHẠY NGẦM (fire-and-forget), không block webhook response.
 *
 * @param {object} params
 * @param {Array} params.steps - Mảng steps JSON [{id, text, media_urls, delay_seconds}]
 * @param {string} params.senderId - Facebook PSID người nhận
 * @param {string} params.pageAccessToken - Token gửi tin
 * @param {number} params.shopId
 * @param {number} params.customerId
 * @param {object} params.io - Socket.IO instance
 * @param {string} params.ruleKeyword - Keyword đã match (for logging)
 */
async function executeBotSteps({ steps, senderId, pageAccessToken, shopId, customerId, io, ruleKeyword }) {
  const db = getDB();

  console.log('═'.repeat(60));
  console.log(`[BOT STEP] 🤖 Bắt đầu gửi ${steps.length} bước — Rule: "${ruleKeyword}"`);
  console.log(`[BOT STEP]   📦 Shop #${shopId} | 👤 Khách #${customerId} | 📩 PSID: ${senderId}`);
  console.log('═'.repeat(60));

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepLabel = `Bước ${i + 1}/${steps.length}`;

    try {
      // ═══════════════════════════════════════
      // DELAY: Chờ trước khi gửi step này
      // ═══════════════════════════════════════
      const delaySec = Math.min(Math.max(Number(step.delay_seconds) || 0, 0), 15);
      if (delaySec > 0) {
        // Bật typing indicator cho tự nhiên
        await sendTypingIndicator(senderId, pageAccessToken, 'typing_on');
        console.log(`[BOT STEP] ⏳ ${stepLabel}: Chờ ${delaySec}s...`);
        await sleep(delaySec * 1000);
      }

      // ═══════════════════════════════════════
      // GỬI MEDIA (nếu có)
      // ═══════════════════════════════════════
      const mediaUrls = Array.isArray(step.media_urls) ? step.media_urls.filter(Boolean) : [];
      for (const mediaUrl of mediaUrls) {
        await sendMediaAttachment(senderId, mediaUrl, pageAccessToken);

        // Lưu message vào DB
        const mediaType = detectMediaType(mediaUrl);
        const mediaResult = await db.run(
          'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, intent, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [shopId, customerId, 'bot', 'bot', `[${mediaType === 'video' ? 'Video' : 'Ảnh'}] ${mediaUrl}`, 'keyword_rule', 'inbox']
        );

        // Emit Socket cho Dashboard
        if (io) {
          io.to(String(shopId)).emit('new_message', {
            id: mediaResult.lastID,
            shop_id: shopId,
            customer_id: customerId,
            sender: 'bot',
            sender_type: 'bot',
            text: `[Ảnh] ${mediaUrl}`,
            intent: 'keyword_rule',
            type: 'inbox',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // ═══════════════════════════════════════
      // GỬI TEXT (nếu có)
      // ═══════════════════════════════════════
      if (step.text && step.text.trim()) {
        await sendTextMessage(senderId, step.text, pageAccessToken);

        // Lưu message vào DB
        const textResult = await db.run(
          'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, intent, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [shopId, customerId, 'bot', 'bot', step.text, 'keyword_rule', 'inbox']
        );

        // Emit Socket cho Dashboard
        if (io) {
          io.to(String(shopId)).emit('new_message', {
            id: textResult.lastID,
            shop_id: shopId,
            customer_id: customerId,
            sender: 'bot',
            sender_type: 'bot',
            text: step.text,
            intent: 'keyword_rule',
            type: 'inbox',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Tắt typing indicator
      await sendTypingIndicator(senderId, pageAccessToken, 'typing_off');

      console.log(`[BOT STEP] ✅ ${stepLabel} hoàn tất.`);

    } catch (stepError) {
      console.error(`[BOT STEP] ❌ ${stepLabel} LỖI:`, stepError.message);
      // Tiếp tục bước tiếp theo, không dừng chuỗi
    }
  }

  // Bug 3a fix: cập nhật last_bot_message_at sau khi bot gửi xong kịch bản
  try {
    await db.run(
      `UPDATE Customers SET last_bot_message_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`,
      [customerId, shopId]
    );
  } catch (e) {
    console.warn('[BOT STEP] last_bot_message_at update failed:', e.message);
  }

  // Cập nhật lastMessage trong customer list
  if (io) {
    io.to(String(shopId)).emit('customer_updated', { customer_id: customerId });
  }

  console.log(`[BOT STEP] 🎉 Hoàn tất ${steps.length} bước cho Rule "${ruleKeyword}"`);
  console.log('═'.repeat(60));
}

module.exports = { executeBotSteps };
