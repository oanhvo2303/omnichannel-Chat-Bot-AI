'use strict';

const crypto = require('crypto');
const express = require('express');
const { getDB }           = require('../../infra/database/sqliteConnection');
const { authMiddleware }  = require('../middlewares/authMiddleware');
const shopeeService       = require('../services/shopeeService');
const tiktokService       = require('../services/tiktokService');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace OAuth State Signing — Chống cross-tenant credential injection
//
// Shopee/TikTok đều hỗ trợ tham số `state` trong OAuth flow.
// state = base64url(JSON{ shopId, nonce, sig })
// sig   = hmac-sha256(shopId + ":" + nonce, OAUTH_STATE_SECRET)
// ─────────────────────────────────────────────────────────────────────────────

const config = require('../../config');
// FIX: Dùng config.jwt.secret (đã bắt buộc) — loại bỏ fallback 'changeme' nguy hiểm
const STATE_SECRET = process.env.OAUTH_STATE_SECRET || config.jwt.secret;

function signOAuthState(shopId) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig   = crypto
    .createHmac('sha256', STATE_SECRET)
    .update(`${shopId}:${nonce}`)
    .digest('hex');

  return Buffer.from(JSON.stringify({ shopId: String(shopId), nonce, sig })).toString('base64url');
}

function verifyOAuthState(stateParam) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid state format');
  }

  const { shopId, nonce, sig } = payload;
  if (!shopId || !nonce || !sig) throw new Error('Incomplete state fields');

  const expectedSig = crypto
    .createHmac('sha256', STATE_SECRET)
    .update(`${shopId}:${nonce}`)
    .digest('hex');

  const a = Buffer.from(sig,         'hex');
  const b = Buffer.from(expectedSig, 'hex');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('State signature mismatch — possible CSRF attack');
  }

  return shopId;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOPEE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/marketplace/shopee/auth
 * Tạo URL OAuth Shopee với signed state (truyền shopId an toàn qua flow).
 */
router.get('/shopee/auth', authMiddleware, (req, res) => {
  const proto       = req.get('x-forwarded-proto') || req.protocol;
  const host        = req.get('host');
  const redirectUrl = `${proto}://${host}/api/marketplace/shopee/callback`;

  const state   = signOAuthState(req.shop.shopId);
  const authUrl = shopeeService.getShopeeAuthUrl(redirectUrl, state);

  console.log(`[SHOPEE OAUTH] Shop #${req.shop.shopId} bắt đầu kết nối Shopee.`);
  res.json({ auth_url: authUrl });
});

/**
 * GET /api/marketplace/shopee/callback
 * Nhận callback từ Shopee, verify state để xác định đúng shopId.
 */
router.get('/shopee/callback', async (req, res) => {
  try {
    const { code, shop_id: shopeeShopId, state } = req.query;

    if (!code || !shopeeShopId) {
      return res.status(400).send('Missing code or shop_id from Shopee.');
    }

    // ── SECURITY: Verify state để xác định shopId đúng tenant ─────────────
    if (!state) {
      console.error('[SHOPEE OAUTH] Thiếu state parameter.');
      return res.status(400).send('Missing state parameter. Unauthorized callback.');
    }

    let shopId;
    try {
      shopId = verifyOAuthState(state);
    } catch (err) {
      console.error('[SHOPEE OAUTH SECURITY] State invalid:', err.message);
      return res.status(403).send('Invalid state: ' + err.message);
    }
    // ──────────────────────────────────────────────────────────────────────

    const tokenData = await shopeeService.getShopeeToken(code, shopeeShopId);

    if (!tokenData.access_token) {
      console.error('[SHOPEE OAUTH] Lỗi lấy token:', JSON.stringify(tokenData));
      return res.status(400).send('Lỗi kết nối Shopee: ' + JSON.stringify(tokenData));
    }

    const db = getDB();

    // Cập nhật đúng tenant (WHERE id = shopId từ verified state)
    const result = await db.run(
      `UPDATE Shops
       SET shopee_shop_id = ?, shopee_access_token = ?, shopee_refresh_token = ?
       WHERE id = ?`,
      [shopeeShopId, tokenData.access_token, tokenData.refresh_token, shopId]
    );

    if (result.changes === 0) {
      console.error(`[SHOPEE OAUTH] Shop #${shopId} không tồn tại hoặc update thất bại.`);
      return res.status(404).send('Shop không tồn tại.');
    }

    console.log(`[SHOPEE OAUTH] ✅ Shop #${shopId} kết nối Shopee Shop ${shopeeShopId}`);
    res.send(`<html><body>
      <h2>✅ Kết nối Shopee thành công!</h2>
      <p>Bạn có thể đóng tab này.</p>
      <script>window.close()</script>
    </body></html>`);
  } catch (error) {
    console.error('[SHOPEE OAUTH]', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TIKTOK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/marketplace/tiktok/auth
 * Tạo URL OAuth TikTok Shop với signed state.
 */
router.get('/tiktok/auth', authMiddleware, (req, res) => {
  const proto       = req.get('x-forwarded-proto') || req.protocol;
  const host        = req.get('host');
  const redirectUrl = `${proto}://${host}/api/marketplace/tiktok/callback`;

  const state   = signOAuthState(req.shop.shopId);
  const authUrl = tiktokService.getTikTokAuthUrl(redirectUrl, state);

  console.log(`[TIKTOK OAUTH] Shop #${req.shop.shopId} bắt đầu kết nối TikTok Shop.`);
  res.json({ auth_url: authUrl });
});

/**
 * GET /api/marketplace/tiktok/callback
 * Nhận callback từ TikTok, verify state để xác định đúng shopId.
 */
router.get('/tiktok/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send('Missing code from TikTok.');
    }

    // ── SECURITY: Verify state ─────────────────────────────────────────────
    if (!state) {
      console.error('[TIKTOK OAUTH] Thiếu state parameter.');
      return res.status(400).send('Missing state parameter. Unauthorized callback.');
    }

    let shopId;
    try {
      shopId = verifyOAuthState(state);
    } catch (err) {
      console.error('[TIKTOK OAUTH SECURITY] State invalid:', err.message);
      return res.status(403).send('Invalid state: ' + err.message);
    }
    // ──────────────────────────────────────────────────────────────────────

    const tokenData = await tiktokService.getTikTokToken(code);

    if (!tokenData.data?.access_token) {
      console.error('[TIKTOK OAUTH] Lỗi lấy token:', JSON.stringify(tokenData));
      return res.status(400).send('Lỗi kết nối TikTok: ' + JSON.stringify(tokenData));
    }

    const t  = tokenData.data;
    const db = getDB();

    // Cập nhật đúng tenant (WHERE id = shopId từ verified state)
    const result = await db.run(
      `UPDATE Shops
       SET tiktok_shop_id = ?, tiktok_access_token = ?, tiktok_refresh_token = ?
       WHERE id = ?`,
      [t.open_id, t.access_token, t.refresh_token, shopId]
    );

    if (result.changes === 0) {
      console.error(`[TIKTOK OAUTH] Shop #${shopId} không tồn tại hoặc update thất bại.`);
      return res.status(404).send('Shop không tồn tại.');
    }

    console.log(`[TIKTOK OAUTH] ✅ Shop #${shopId} kết nối TikTok Shop ${t.open_id}`);
    res.send(`<html><body>
      <h2>✅ Kết nối TikTok Shop thành công!</h2>
      <p>Bạn có thể đóng tab này.</p>
      <script>window.close()</script>
    </body></html>`);
  } catch (error) {
    console.error('[TIKTOK OAUTH]', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/marketplace/status
 * Trả về trạng thái kết nối sàn cho shop hiện tại.
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const db   = getDB();
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
