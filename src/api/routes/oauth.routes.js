'use strict';

const express = require('express');
const config = require('../../config');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * GET /api/oauth/facebook
 * Trả về URL đăng nhập Facebook (Frontend gọi bằng authFetch có Bearer token).
 * Frontend nhận URL rồi tự redirect bằng window.location.href.
 */
router.get('/facebook', authMiddleware, (req, res) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/api/oauth/facebook/callback`;

  const fbLoginUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  fbLoginUrl.searchParams.set('client_id', config.facebook.appId);
  fbLoginUrl.searchParams.set('redirect_uri', redirectUri);
  fbLoginUrl.searchParams.set('scope', 'pages_messaging,pages_show_list,pages_manage_metadata');
  fbLoginUrl.searchParams.set('state', req.shop.shopId); // shopId từ JWT → truyền qua state
  fbLoginUrl.searchParams.set('response_type', 'code');

  console.log(`[OAUTH] Shop #${req.shop.shopId} bắt đầu kết nối Facebook.`);
  res.json({ url: fbLoginUrl.toString() });
});

/**
 * GET /api/oauth/facebook/callback
 * Facebook redirect về đây với ?code=XXX&state=shopId
 * Đổi code → short-lived token → long-lived token → lưu vào DB
 */
router.get('/facebook/callback', async (req, res) => {
  try {
    const { code, state: shopId } = req.query;

    if (!code || !shopId) {
      return res.status(400).send('Missing code or state parameter.');
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/oauth/facebook/callback`;

    // Step 1: Đổi code → short-lived User Access Token
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', config.facebook.appId);
    tokenUrl.searchParams.set('client_secret', config.facebook.appSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('[OAUTH] Lỗi đổi code:', tokenData.error);
      return res.status(400).send('Lỗi xác thực Facebook: ' + tokenData.error.message);
    }

    const shortLivedToken = tokenData.access_token;

    // Step 2: Đổi short-lived → long-lived token (60 ngày)
    const longLivedUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', config.facebook.appId);
    longLivedUrl.searchParams.set('client_secret', config.facebook.appSecret);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedRes.json();

    const userAccessToken = longLivedData.access_token || shortLivedToken;

    // Step 3: Lấy danh sách Pages mà user quản lý
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}`
    );
    const pagesData = await pagesRes.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return res.status(400).send('Không tìm thấy Fanpage nào. Hãy chắc chắn bạn là admin của ít nhất 1 Page.');
    }

    const db = getDB();

    for (const page of pagesData.data) {
      const pageId = page.id;
      const pageAccessToken = page.access_token; // Page Access Token vĩnh viễn

      // Lưu 1 page vào legacy (chỉ để tương thích ngược nếu cần, ghi đè liên tục lấy cái cuối)
      await db.run(
        'UPDATE Shops SET facebook_page_id = ?, page_access_token = ? WHERE id = ?',
        [pageId, pageAccessToken, shopId]
      );

      // Lưu TẤT CẢ các Pages vào bảng ShopIntegrations (Đa Fanpage)
      // Dùng platform = 'facebook_' + pageId để bypass unique constraint (shop_id, platform)
      const platformKey = `facebook_${pageId}`;

      await db.run(`
        INSERT INTO ShopIntegrations (shop_id, platform, access_token, page_name, page_id, status, connected_at)
        VALUES (?, ?, ?, ?, ?, 'connected', CURRENT_TIMESTAMP)
        ON CONFLICT(shop_id, platform)
        DO UPDATE SET access_token = excluded.access_token, page_name = excluded.page_name,
                      page_id = excluded.page_id, status = 'connected', connected_at = CURRENT_TIMESTAMP
      `, [shopId, platformKey, pageAccessToken, page.name, pageId]);

      console.log(`[OAUTH] Shop #${shopId} kết nối Fanpage: ${page.name} (ID: ${pageId})`);
    }

    // Step 6: Tự động subscribe Webhook cho TẤT CẢ các Pages vừa fetch được
    for (const page of pagesData.data) {
      const pageId = page.id;
      const pageAccessToken = page.access_token;
      try {
        const subscribeUrl = new URL(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`);
        subscribeUrl.searchParams.set('subscribed_fields', 'messages,messaging_postbacks,feed');
        subscribeUrl.searchParams.set('access_token', pageAccessToken);

        const subRes = await fetch(subscribeUrl.toString(), { method: 'POST' });
        const subData = await subRes.json();

        if (subData.success) {
          console.log(`✅ Đã tự động subscribe Webhook cho Page: ${page.name}`);
        } else {
          console.error(`❌ Subscribe Webhook thất bại cho Page ${page.name}:`, subData.error?.message);
        }
      } catch (err) {
        console.error(`❌ Lỗi ngoại lệ khi subscribe Webhook cho ${page.name}:`, err.message);
      }
    }

    // Redirect về Frontend Integrations page
    res.redirect('http://localhost:3002/settings/integrations?fb_connected=true');
  } catch (error) {
    console.error('[OAUTH] Lỗi callback:', error.message);
    res.redirect('http://localhost:3002/settings/integrations?fb_error=' + encodeURIComponent(error.message));
  }
});

module.exports = router;
