'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { writeAudit, getClientIp } = require('../services/auditService');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');

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
      await db.run(
        'UPDATE Shops SET gemini_api_key = ? WHERE id = ?',
        [gemini_api_key.trim(), req.shop.shopId]
      );
      console.log(`[AI SETTINGS] Shop #${req.shop.shopId} đã cập nhật Gemini API Key.`);
    }

    if (ai_quota_limit !== undefined) {
      // P3 fix: tenant KHÔNG được tự set unlimited (-1) hoặc quota tuỳ ý
      // Quota phải do billing/admin quản lý — clamp trong khoảng hợp lệ
      const quotaNum = parseInt(ai_quota_limit, 10);
      if (!Number.isFinite(quotaNum) || quotaNum < 100 || quotaNum > 10000) {
        return res.status(400).json({ error: 'Quota hợp lệ phải từ 100 đến 10,000 tin/tháng. Liên hệ admin để tăng giới hạn.' });
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

    // Nếu không truyền key mới → dùng key trong DB
    let keyToTest = gemini_api_key;
    if (!keyToTest || keyToTest.includes('••')) {
      const shop = await db.get('SELECT gemini_api_key FROM Shops WHERE id = ?', [req.shop.shopId]);
      keyToTest = shop?.gemini_api_key;
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
 * Reset AI usage counter về 0.
 */
router.post('/reset-quota', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    await db.run('UPDATE Shops SET ai_messages_used = 0 WHERE id = ?', [req.shop.shopId]);
    console.log(`[AI SETTINGS] Shop #${req.shop.shopId} đã reset AI quota.`);
    res.json({ success: true, message: 'Đã reset bộ đếm AI.' });
  } catch (error) {
    console.error('[AI SETTINGS] Lỗi reset quota:', error.message);
    res.status(500).json({ error: 'Lỗi reset quota.' });
  }
});

module.exports = router;
