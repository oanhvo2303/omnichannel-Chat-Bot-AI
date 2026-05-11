'use strict';

const crypto = require('crypto');
const express = require('express');
const config = require('../../config');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// OAuth State Signing — Chống CSRF và Shop Hijack
//
// state = base64url(JSON{ shopId, nonce, sig })
// sig   = hmac-sha256(shopId + ":" + nonce, JWT_SECRET)
//
// Callback phải verify sig trước khi tin dùng shopId.
// Nonce đảm bảo mỗi flow OAuth là unique (không replay được).
// ─────────────────────────────────────────────────────────────────────────────

const STATE_HMAC_SECRET = process.env.OAUTH_STATE_SECRET || config.jwt.secret;

/**
 * Tạo signed state token cho OAuth flow.
 * @param {number|string} shopId
 * @returns {string} base64url-encoded state
 */
function signOAuthState(shopId) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto
    .createHmac('sha256', STATE_HMAC_SECRET)
    .update(`${shopId}:${nonce}`)
    .digest('hex');

  const payload = JSON.stringify({ shopId: String(shopId), nonce, sig });
  return Buffer.from(payload).toString('base64url');
}

/**
 * Xác thực và giải mã state token.
 * @param {string} stateParam — giá trị từ req.query.state
 * @returns {string} shopId đã xác thực
 * @throws {Error} nếu state bị giả mạo hoặc sai định dạng
 */
function verifyOAuthState(stateParam) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'));
  } catch {
    throw new Error('OAuth state: invalid base64/JSON format');
  }

  const { shopId, nonce, sig } = payload;
  if (!shopId || !nonce || !sig) {
    throw new Error('OAuth state: missing required fields');
  }

  const expectedSig = crypto
    .createHmac('sha256', STATE_HMAC_SECRET)
    .update(`${shopId}:${nonce}`)
    .digest('hex');

  // timing-safe compare để chống timing attack
  const sigBuf      = Buffer.from(sig,         'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');

  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error('OAuth state: signature mismatch — possible CSRF attack');
  }

  return shopId;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/oauth/facebook
 * Tạo URL đăng nhập Facebook với signed state.
 * Frontend nhận URL rồi redirect bằng window.location.href.
 */
router.get('/facebook', authMiddleware, (req, res) => {
  const proto      = req.get('x-forwarded-proto') || req.protocol;
  const siteUrl    = process.env.SITE_URL || `${proto}://${req.get('host')}`;
  const redirectUri = `${siteUrl}/api/oauth/facebook/callback`;

  // state được ký — không thể giả mạo shopId
  const state = signOAuthState(req.shop.shopId);

  const fbLoginUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  fbLoginUrl.searchParams.set('client_id',     config.facebook.appId);
  fbLoginUrl.searchParams.set('redirect_uri',  redirectUri);
  fbLoginUrl.searchParams.set('scope',         'pages_messaging,pages_show_list,pages_manage_metadata');
  fbLoginUrl.searchParams.set('state',         state);
  fbLoginUrl.searchParams.set('response_type', 'code');

  console.log(`[OAUTH] Shop #${req.shop.shopId} bắt đầu kết nối Facebook.`);
  res.json({ url: fbLoginUrl.toString() });
});

/**
 * GET /api/oauth/facebook/callback
 * Facebook redirect về đây với ?code=XXX&state=<signed_state>
 */
router.get('/facebook/callback', async (req, res) => {
  const errFrontend = process.env.FRONTEND_URL || process.env.SITE_URL || 'http://localhost:3002';

  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('Missing code or state parameter.');
    }

    // ── SECURITY: Verify signed state trước khi dùng shopId ──────────────
    let shopId;
    try {
      shopId = verifyOAuthState(state);
    } catch (stateErr) {
      console.error('[OAUTH SECURITY] State verification failed:', stateErr.message);
      return res.redirect(`${errFrontend}/settings/integrations?fb_error=` + encodeURIComponent('Xác thực OAuth thất bại: ' + stateErr.message));
    }
    // ─────────────────────────────────────────────────────────────────────

    // Kiểm tra shop tồn tại trong DB trước khi tiếp tục
    const db = getDB();
    const shopExists = await db.get('SELECT id FROM Shops WHERE id = ?', [shopId]);
    if (!shopExists) {
      console.error(`[OAUTH] Shop #${shopId} không tồn tại trong DB.`);
      return res.redirect(`${errFrontend}/settings/integrations?fb_error=` + encodeURIComponent('Shop không tồn tại.'));
    }

    const proto       = req.get('x-forwarded-proto') || req.protocol;
    const siteUrl     = process.env.SITE_URL || `${proto}://${req.get('host')}`;
    const redirectUri = `${siteUrl}/api/oauth/facebook/callback`;
    const frontendUrl = process.env.FRONTEND_URL || siteUrl;

    // Step 1: Đổi code → short-lived User Access Token
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id',     config.facebook.appId);
    tokenUrl.searchParams.set('client_secret', config.facebook.appSecret);
    tokenUrl.searchParams.set('redirect_uri',  redirectUri);
    tokenUrl.searchParams.set('code',          code);

    const tokenRes  = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('[OAUTH] Lỗi đổi code:', tokenData.error);
      return res.status(400).send('Lỗi xác thực Facebook: ' + tokenData.error.message);
    }

    const shortLivedToken = tokenData.access_token;

    // Step 2: Đổi short-lived → long-lived token (60 ngày)
    const longLivedUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    longLivedUrl.searchParams.set('grant_type',       'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id',        config.facebook.appId);
    longLivedUrl.searchParams.set('client_secret',    config.facebook.appSecret);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longLivedRes  = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedRes.json();

    const userAccessToken = longLivedData.access_token || shortLivedToken;

    // Step 3: Lấy danh sách Pages mà user quản lý
    const pagesRes  = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}`
    );
    const pagesData = await pagesRes.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return res.status(400).send(
        'Không tìm thấy Fanpage nào. Hãy chắc chắn bạn là admin của ít nhất 1 Page.'
      );
    }

    // Step 4: Lưu tất cả Pages vào ShopIntegrations (multi-page)
    for (const page of pagesData.data) {
      const pageId          = page.id;
      const pageAccessToken = page.access_token; // Page Access Token vĩnh viễn
      const platformKey     = `facebook_${pageId}`;

      // Legacy update (tương thích ngược)
      await db.run(
        'UPDATE Shops SET facebook_page_id = ?, page_access_token = ? WHERE id = ?',
        [pageId, pageAccessToken, shopId]
      );

      // Upsert vào ShopIntegrations (nguồn sự thật chính thức)
      await db.run(`
        INSERT INTO ShopIntegrations (shop_id, platform, access_token, page_name, page_id, status, connected_at)
        VALUES (?, ?, ?, ?, ?, 'connected', CURRENT_TIMESTAMP)
        ON CONFLICT(shop_id, platform)
        DO UPDATE SET
          access_token = excluded.access_token,
          page_name    = excluded.page_name,
          page_id      = excluded.page_id,
          status       = 'connected',
          connected_at = CURRENT_TIMESTAMP
      `, [shopId, platformKey, pageAccessToken, page.name, pageId]);

      console.log(`[OAUTH] Shop #${shopId} kết nối Fanpage: ${page.name} (ID: ${pageId})`);
    }

    // Step 5: Subscribe Webhook cho tất cả Pages
    for (const page of pagesData.data) {
      const pageId          = page.id;
      const pageAccessToken = page.access_token;
      try {
        const subscribeUrl = new URL(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`);
        subscribeUrl.searchParams.set('subscribed_fields', 'messages,messaging_postbacks,feed');
        subscribeUrl.searchParams.set('access_token', pageAccessToken);

        const subRes  = await fetch(subscribeUrl.toString(), { method: 'POST' });
        const subData = await subRes.json();

        if (subData.success) {
          console.log(`✅ Đã subscribe Webhook cho Page: ${page.name}`);
        } else {
          console.error(`❌ Subscribe Webhook thất bại cho ${page.name}:`, subData.error?.message);
        }
      } catch (err) {
        console.error(`❌ Lỗi subscribe Webhook cho ${page.name}:`, err.message);
      }
    }

    res.redirect(`${frontendUrl}/settings/integrations?fb_connected=true`);
  } catch (error) {
    console.error('[OAUTH] Lỗi callback:', error.message);
    res.redirect(`${errFrontend}/settings/integrations?fb_error=` + encodeURIComponent(error.message));
  }
});

module.exports = router;
