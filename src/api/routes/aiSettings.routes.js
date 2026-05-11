'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { writeAudit, getClientIp } = require('../services/auditService');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');

// ─── API Key Encryption at-rest (AES-256-GCM) ─────────────────────────────
// ENCRYPTION_KEY phải là 64 hex ký tự (32 bytes). Set trong .env hoặc PM2 env.
const ENC_KEY_HEX = process.env.ENCRYPTION_KEY || '';
const CAN_ENCRYPT = ENC_KEY_HEX.length === 64;
if (!CAN_ENCRYPT) {
  console.warn('[AI SETTINGS] ⚠️ ENCRYPTION_KEY chưa set → API key sẽ lưu plaintext (không an toàn cho production!)');
}

function encryptKey(plaintext) {
  if (!CAN_ENCRYPT || !plaintext) return plaintext;
  const iv = crypto.randomBytes(12);
  const encKey = Buffer.from(ENC_KEY_HEX, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: enc:iv_hex:tag_hex:ciphertext_hex
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptKey(stored) {
  if (!stored) return null;
  if (!stored.startsWith('enc:')) return stored; // legacy plaintext
  if (!CAN_ENCRYPT) {
    console.error('[AI SETTINGS] ❌ ENCRYPTION_KEY chưa set, không decrypt được key!');
    return null;
  }
  try {
    const [, ivHex, tagHex, ctHex] = stored.split(':');
    const encKey = Buffer.from(ENC_KEY_HEX, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(ctHex, 'hex')) + decipher.final('utf8');
  } catch (e) {
    console.error('[AI SETTINGS] ❌ Decrypt API key thất bại:', e.message);
    return null;
  }
}
// ───────────────────────────────────────────────────────────────────────────

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/settings/ai
 * Lấy cấu hình AI của shop hiện tại (key đã mask).
 */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const shop = await db.get(
      'SELECT gemini_api_key, ai_quota_limit, ai_messages_used FROM Shops WHERE id = ?',
      [req.shop.shopId]
    );
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại.' });

    // Mask API key (chỉ hiện 8 ký tự đầu + 4 cuối)
    let maskedKey = '';
    if (shop.gemini_api_key) {
      const key = shop.gemini_api_key;
      if (key.length > 12) {
        maskedKey = key.substring(0, 8) + '••••••••••••' + key.substring(key.length - 4);
      } else {
        maskedKey = '••••••••••••';
      }
    }

    res.json({
      gemini_api_key_masked: maskedKey,
      has_key: !!shop.gemini_api_key,
      ai_quota_limit: shop.ai_quota_limit || 1000,
      ai_messages_used: shop.ai_messages_used || 0,
    });
  } catch (error) {
    console.error('[AI SETTINGS] Lỗi GET:', error.message);
    res.status(500).json({ error: 'Lỗi tải cấu hình AI.' });
  }
});

/**
 * PATCH /api/settings/ai
 * Cập nhật Gemini API Key + Quota cho shop.
 */
router.patch('/', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { gemini_api_key, ai_quota_limit } = req.body;

    // Nếu key là '••••' (masked) → không cập nhật, giữ nguyên
    if (gemini_api_key && !gemini_api_key.includes('••')) {
      // Fix 3: encrypt at-rest trước khi lưu
      const toStore = encryptKey(gemini_api_key.trim());
      await db.run(
        'UPDATE Shops SET gemini_api_key = ? WHERE id = ?',
        [toStore, req.shop.shopId]
      );
      console.log(`[AI SETTINGS] Shop #${req.shop.shopId} đã cập nhật Gemini API Key (${CAN_ENCRYPT ? 'encrypted' : 'plaintext'}).`);
    }
    if (ai_quota_limit !== undefined) {
      // Quota tự quản lý cho shop (API key của riêng họ) — giới hạn rộng hơn
      // Admin vẫn có thể set quota khác qua /api/admin/tenants/:id/quota
      // 999999 = "unlimited" mode từ frontend khi user tắt giới hạn
      const quotaNum = parseInt(ai_quota_limit, 10);
      if (!Number.isFinite(quotaNum) || quotaNum < 1 || quotaNum > 999999) {
        return res.status(400).json({ error: 'Quota hợp lệ phải từ 1 đến 999,999 tin/tháng.' });
      }
      await db.run(
        'UPDATE Shops SET ai_quota_limit = ? WHERE id = ?',
        [quotaNum, req.shop.shopId]
      );
    }

    writeAudit({ shopId: req.shop.shopId, actorId: req.shop.staffId, actorRole: req.shop.role, action: 'UPDATE_AI_SETTINGS', resource: 'AISettings', ip: getClientIp(req) });
    res.json({ success: true, message: 'Đã cập nhật cấu hình AI.' });
  } catch (error) {
    console.error('[AI SETTINGS] Lỗi PATCH:', error.message);
    res.status(500).json({ error: 'Lỗi cập nhật cấu hình AI.' });
  }
});

/**
 * POST /api/settings/ai/test
 * Test thử Gemini API Key có hoạt động không.
 */
router.post('/test', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { gemini_api_key } = req.body;

    // Nếu không truyền key mới → dùng key trong DB (cần decrypt)
    let keyToTest = gemini_api_key;
    if (!keyToTest || keyToTest.includes('••')) {
      const shop = await db.get('SELECT gemini_api_key FROM Shops WHERE id = ?', [req.shop.shopId]);
      // Fix 3: decrypt nếu đang encrypted
      keyToTest = decryptKey(shop?.gemini_api_key);
    }

    if (!keyToTest) {
      return res.status(400).json({ success: false, error: 'Chưa có API Key để test.' });
    }

    // Test bằng cách gọi Gemini API thật
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const testGenAI = new GoogleGenerativeAI(keyToTest);
    const testModel = testGenAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const startTime = Date.now();
    const result = await testModel.generateContent('Trả lời ngắn gọn: 1+1=?');
    const responseText = result.response.text();
    const elapsed = Date.now() - startTime;

    console.log(`[AI SETTINGS] ✅ Test API Key thành công cho Shop #${req.shop.shopId}: "${responseText.substring(0, 50)}" (${elapsed}ms)`);

    res.json({
      success: true,
      response: responseText.substring(0, 100),
      latency_ms: elapsed,
      model: 'gemini-2.5-flash',
    });
  } catch (error) {
    console.error(`[AI SETTINGS] ❌ Test API Key thất bại cho Shop #${req.shop.shopId}:`, error.message);

    let errorDetail = 'API Key không hợp lệ hoặc đã hết hạn.';
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('api_key') || msg.includes('api key') || msg.includes('invalid')) {
      errorDetail = 'API Key không hợp lệ. Kiểm tra lại key từ https://aistudio.google.com/apikey';
    } else if (msg.includes('quota') || msg.includes('rate') || msg.includes('429')) {
      errorDetail = 'API Key hợp lệ nhưng đã hết quota. Nâng cấp gói hoặc tạo key mới.';
    } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')) {
      errorDetail = 'Lỗi kết nối mạng. Kiểm tra internet.';
    }

    res.status(400).json({ success: false, error: errorDetail });
  }
});

/**
 * POST /api/settings/ai/reset-quota
 * Fix 2: KHÔNG cho tenant tự reset quota — đây là hành động billing.
 * Để tránh break frontend cũ, trả 403 rõ ràng thay vì 404.
 */
router.post('/reset-quota', requireOwnerOrAdmin, (_req, res) => {
  return res.status(403).json({
    error: 'Reset quota là thao tác billing. Vui lòng liên hệ admin để điều chỉnh.',
  });
});

module.exports = router;
