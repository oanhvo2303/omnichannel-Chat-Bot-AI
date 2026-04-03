'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const shopeeService = require('../services/shopeeService');
const tiktokService = require('../services/tiktokService');

const router = express.Router();

/**
 * Marketplace OAuth Routes — Kết nối Shopee + TikTok Shop
 */

// ============ SHOPEE ============

/** GET /api/marketplace/shopee/auth — Tạo URL OAuth Shopee */
router.get('/shopee/auth', authMiddleware, (req, res) => {
  const redirectUrl = `${req.protocol}://${req.get('host')}/api/marketplace/shopee/callback`;
  const authUrl = shopeeService.getShopeeAuthUrl(redirectUrl);
  res.json({ auth_url: authUrl });
});

/** GET /api/marketplace/shopee/callback — Nhận callback từ Shopee */
router.get('/shopee/callback', async (req, res) => {
  try {
    const { code, shop_id: shopeeShopId } = req.query;
    if (!code || !shopeeShopId) return res.status(400).send('Missing code or shop_id');

    const tokenData = await shopeeService.getShopeeToken(code, shopeeShopId);

    if (tokenData.access_token) {
      // Tìm shop bằng state hoặc lưu vào shop đầu tiên cần kết nối
      const db = getDB();
      // Lưu credentials
      await db.run(
        `UPDATE Shops SET shopee_shop_id = ?, shopee_access_token = ?, shopee_refresh_token = ? WHERE shopee_shop_id IS NULL OR shopee_shop_id = ?`,
        [shopeeShopId, tokenData.access_token, tokenData.refresh_token, shopeeShopId]
      );
      console.log(`[SHOPEE OAuth] ✅ Kết nối Shopee Shop ${shopeeShopId}`);
      res.send('<html><body><h2>✅ Kết nối Shopee thành công!</h2><p>Bạn có thể đóng tab này.</p><script>window.close()</script></body></html>');
    } else {
      res.status(400).send('Lỗi kết nối Shopee: ' + JSON.stringify(tokenData));
    }
  } catch (error) {
    console.error('[SHOPEE OAuth]', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// ============ TIKTOK ============

/** GET /api/marketplace/tiktok/auth — Tạo URL OAuth TikTok Shop */
router.get('/tiktok/auth', authMiddleware, (req, res) => {
  const redirectUrl = `${req.protocol}://${req.get('host')}/api/marketplace/tiktok/callback`;
  const authUrl = tiktokService.getTikTokAuthUrl(redirectUrl);
  res.json({ auth_url: authUrl });
});

/** GET /api/marketplace/tiktok/callback — Nhận callback từ TikTok */
router.get('/tiktok/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');

    const tokenData = await tiktokService.getTikTokToken(code);

    if (tokenData.data?.access_token) {
      const db = getDB();
      const t = tokenData.data;
      await db.run(
        `UPDATE Shops SET tiktok_shop_id = ?, tiktok_access_token = ?, tiktok_refresh_token = ? WHERE tiktok_shop_id IS NULL OR tiktok_shop_id = ?`,
        [t.open_id, t.access_token, t.refresh_token, t.open_id]
      );
      console.log(`[TIKTOK OAuth] ✅ Kết nối TikTok Shop ${t.open_id}`);
      res.send('<html><body><h2>✅ Kết nối TikTok Shop thành công!</h2><p>Bạn có thể đóng tab này.</p><script>window.close()</script></body></html>');
    } else {
      res.status(400).send('Lỗi kết nối TikTok: ' + JSON.stringify(tokenData));
    }
  } catch (error) {
    console.error('[TIKTOK OAuth]', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// ============ STATUS ============

/** GET /api/marketplace/status — Trạng thái kết nối sàn */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const shop = await db.get(
      'SELECT shopee_shop_id, tiktok_shop_id FROM Shops WHERE id = ?',
      [req.shop.shopId]
    );
    res.json({
      shopee: { connected: !!shop?.shopee_shop_id, shop_id: shop?.shopee_shop_id },
      tiktok: { connected: !!shop?.tiktok_shop_id, shop_id: shop?.tiktok_shop_id },
    });
  } catch (error) {
    console.error('[MARKETPLACE] Lỗi lấy status:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
