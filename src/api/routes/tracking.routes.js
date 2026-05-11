'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.use(authMiddleware);

/**
 * GET /api/tracking
 * Lấy cấu hình Facebook Pixel & CAPI của shop
 */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const config = await db.get(
      'SELECT pixel_id, capi_token, test_event_code, is_active FROM ShopTracking WHERE shop_id = ?',
      [req.shop.shopId]
    );
    // FIX: Không trả full CAPI token về frontend — đây là secret
    const rawToken = config?.capi_token || '';
    const maskedToken = rawToken.length > 4
      ? `****${rawToken.slice(-4)}`
      : (rawToken.length > 0 ? '****' : '');

    res.json({
      pixel_id: config?.pixel_id || '',
      capi_token: maskedToken,          // Masked — chỉ hiển thị có/không để UI biết
      has_capi_token: rawToken.length > 0,
      test_event_code: config?.test_event_code || '',
      is_active: config?.is_active === 1
    });
  } catch (error) {
    console.error('[TRACKING] Lỗi lấy cấu hình:', error.message);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
});

/**
 * POST /api/tracking
 * Cập nhật cấu hình Facebook Pixel & CAPI
 */
router.post('/', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { pixel_id, capi_token, test_event_code, is_active } = req.body;

    const existing = await db.get('SELECT id, capi_token FROM ShopTracking WHERE shop_id = ?', [shopId]);

    // FIX: Nếu user không nhập token mới (gửi rỗng), giữ token cũ trong DB
    const finalCapiToken = (capi_token && capi_token.trim() && !capi_token.startsWith('****'))
      ? capi_token.trim()
      : (existing?.capi_token || '');

    if (existing) {
      await db.run(
        `UPDATE ShopTracking 
         SET pixel_id = ?, capi_token = ?, test_event_code = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE shop_id = ?`,
        [pixel_id, finalCapiToken, test_event_code, is_active ? 1 : 0, shopId]
      );
    } else {
      await db.run(
        `INSERT INTO ShopTracking (shop_id, pixel_id, capi_token, test_event_code, is_active) 
         VALUES (?, ?, ?, ?, ?)`,
        [shopId, pixel_id, finalCapiToken, test_event_code, is_active ? 1 : 0]
      );
    }

    res.json({ success: true, message: 'Cập nhật cấu hình thành công' });
  } catch (error) {
    console.error('[TRACKING] Lỗi cập nhật cấu hình:', error.message);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
});

/**
 * POST /api/tracking/test
 * Gửi Test Event để kiểm tra kết nối API
 */
router.post('/test', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;

    const config = await db.get('SELECT pixel_id, capi_token, test_event_code FROM ShopTracking WHERE shop_id = ?', [shopId]);
    if (!config || !config.pixel_id || !config.capi_token) {
      return res.status(400).json({ error: 'Vui lòng lưu cấu hình Pixel ID và CAPI Token trước khi test.' });
    }

    // Call graph api for testing
    const apiUrl = `https://graph.facebook.com/v19.0/${config.pixel_id}/events`;
    const payload = {
      data: [
        {
          event_name: 'TestEvent',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'system_generated',
          user_data: { client_ip_address: '1.2.3.4', client_user_agent: 'TestAgent' },
        }
      ],
    };

    if (config.test_event_code) {
      payload.test_event_code = config.test_event_code;
    }

    const response = await fetch(`${apiUrl}?access_token=${config.capi_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ error: data.error?.message || 'Lỗi từ Facebook API' });
    }

    res.json({ success: true, message: 'Test event sent successfully' });
  } catch (error) {
    console.error('[TRACKING] Lỗi Test CAPI:', error.message);
    res.status(500).json({ error: 'Lỗi kết nối Facebook API' });
  }
});

module.exports = router;
