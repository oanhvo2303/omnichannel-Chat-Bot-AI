'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

/**
 * GET /api/integrations
 * Lấy danh sách tất cả kênh tích hợp của shop hiện tại.
 */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const integrations = await db.all(
      'SELECT id, platform, page_name, page_id, status, metadata, connected_at, is_ai_active, ai_system_prompt, auto_hide_comments FROM ShopIntegrations WHERE shop_id = ?',
      [req.shop.shopId]
    );
    res.json({ integrations });
  } catch (error) {
    console.error('[INTEGRATIONS] Lỗi GET:', error.message);
    res.status(500).json({ error: 'Lỗi tải danh sách kết nối.' });
  }
});

/**
 * PATCH /api/integrations/:id
 * Cập nhật cấu hình AI (bật/tắt, prompt) hoặc trạng thái status (connected/disconnected)
 */
router.patch('/:id', async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { is_ai_active, ai_system_prompt, status, auto_hide_comments } = req.body;
    
    const integration = await db.get('SELECT id, is_ai_active, ai_system_prompt, status, auto_hide_comments FROM ShopIntegrations WHERE id = ? AND shop_id = ?', [id, req.shop.shopId]);
    if (!integration) return res.status(404).json({ error: 'Kênh tích hợp không tồn tại.' });

    const newIsAiActive = is_ai_active !== undefined ? (is_ai_active ? 1 : 0) : integration.is_ai_active;
    const newAiPrompt = ai_system_prompt !== undefined ? ai_system_prompt : integration.ai_system_prompt;
    const newStatus = status !== undefined ? status : integration.status;
    const newAutoHide = auto_hide_comments !== undefined ? auto_hide_comments : integration.auto_hide_comments;

    await db.run(
      'UPDATE ShopIntegrations SET is_ai_active = ?, ai_system_prompt = ?, status = ?, auto_hide_comments = ? WHERE id = ? AND shop_id = ?',
      [newIsAiActive, newAiPrompt || '', newStatus, newAutoHide, id, req.shop.shopId]
    );
    res.json({ success: true, message: 'Đã cập nhật cấu hình kênh tích hợp.' });
  } catch (error) {
    console.error('[INTEGRATIONS] Lỗi PATCH AI Config:', error.message);
    res.status(500).json({ error: 'Lỗi cập nhật cấu hình AI.' });
  }
});

/**
 * DELETE /api/integrations/:platform
 * Ngắt kết nối một kênh (xóa token khỏi DB).
 */
router.delete('/:platform', async (req, res) => {
  try {
    const db = getDB();
    const { platform } = req.params;

    // Xóa khỏi ShopIntegrations
    const result = await db.run(
      'DELETE FROM ShopIntegrations WHERE shop_id = ? AND platform = ?',
      [req.shop.shopId, platform]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Không tìm thấy kết nối.' });
    }

    // Nếu là facebook, cũng clear trong bảng Shops (legacy compatibility)
    if (platform === 'facebook') {
      await db.run(
        'UPDATE Shops SET facebook_page_id = NULL, page_access_token = NULL WHERE id = ?',
        [req.shop.shopId]
      );
    }

    console.log(`[INTEGRATIONS] Shop #${req.shop.shopId} ngắt kết nối ${platform}.`);
    res.json({ success: true, message: `Đã ngắt kết nối ${platform}.` });
  } catch (error) {
    console.error('[INTEGRATIONS] Lỗi DELETE:', error.message);
    res.status(500).json({ error: 'Lỗi ngắt kết nối.' });
  }
});

/**
 * POST /api/integrations/shipping
 * Lưu Token + Cấu hình Vận Chuyển GHTK/GHN/VTP
 */
router.post('/shipping', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { platform, access_token, metadata } = req.body;

    if (!['ghtk', 'ghn', 'viettel_post'].includes(platform)) {
      return res.status(400).json({ error: 'Platform phải là ghtk, ghn hoặc viettel_post' });
    }

    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    // Upsert Token + Metadata
    const existing = await db.get('SELECT id FROM ShopIntegrations WHERE shop_id = ? AND platform = ?', [shopId, platform]);
    
    if (existing) {
      // Nếu có token mới thì update token, nếu không chỉ update metadata
      if (access_token && access_token !== '••••••••••••••••') {
        await db.run(
          'UPDATE ShopIntegrations SET access_token = ?, metadata = COALESCE(?, metadata), status = ?, connected_at = CURRENT_TIMESTAMP WHERE id = ?',
          [access_token, metadataStr, 'connected', existing.id]
        );
      } else if (metadataStr) {
        await db.run('UPDATE ShopIntegrations SET metadata = ? WHERE id = ?', [metadataStr, existing.id]);
      }
    } else {
      await db.run(
        'INSERT INTO ShopIntegrations (shop_id, platform, access_token, metadata, status, connected_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [shopId, platform, access_token || '', metadataStr, access_token ? 'connected' : 'disconnected']
      );
    }

    res.json({ success: true, message: `Đã lưu cấu hình ${platform.toUpperCase()}` });
  } catch (error) {
    console.error('[SHIPPING CONFIG] Lỗi lưu:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/integrations/shipping-config
 * Lấy cấu hình vận chuyển (metadata) của shop
 */
router.get('/shipping-config', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;

    const rows = await db.all(
      "SELECT platform, status, metadata FROM ShopIntegrations WHERE shop_id = ? AND platform IN ('ghtk', 'ghn', 'viettel_post')",
      [shopId]
    );

    const config = {};
    for (const row of rows) {
      config[row.platform] = {
        status: row.status,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
      };
    }

    res.json({ success: true, config });
  } catch (error) {
    console.error('[SHIPPING CONFIG] Lỗi GET:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
