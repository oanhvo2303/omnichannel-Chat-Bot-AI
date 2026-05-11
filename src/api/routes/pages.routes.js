'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { writeAudit, getClientIp } = require('../services/auditService');
const { checkPlanLimit } = require('../services/planLimitService');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');

const router = express.Router();
router.use(authMiddleware);

const FB_API = 'https://graph.facebook.com/v21.0';

/**
 * Kiểm tra token có còn sống không + lấy thông tin page
 */
async function checkTokenHealth(pageId, accessToken) {
  try {
    const url = `${FB_API}/${pageId}?fields=id,name,fan_count&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.error) return { alive: false, error: data.error.message, code: data.error.code };
    return { alive: true, name: data.name, fan_count: data.fan_count };
  } catch (err) {
    return { alive: false, error: err.message };
  }
}

/**
 * Kiểm tra webhook subscribed chưa
 */
async function checkWebhookSubscription(pageId, accessToken) {
  try {
    const url = `${FB_API}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.error) return { subscribed: false, error: data.error.message };
    const subscribed = Array.isArray(data.data) && data.data.length > 0;
    const fields = data.data?.[0]?.subscribed_fields || [];
    return { subscribed, fields };
  } catch (err) {
    return { subscribed: false, error: err.message };
  }
}

/**
 * Kiểm tra quyền của token
 */
async function checkPermissions(accessToken) {
  const REQUIRED = ['pages_messaging', 'pages_read_engagement', 'pages_manage_metadata'];
  try {
    const url = `${FB_API}/me/permissions?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.error) return { ok: false, granted: [], missing: REQUIRED };
    const granted = data.data?.filter(p => p.status === 'granted').map(p => p.permission) || [];
    const missing = REQUIRED.filter(r => !granted.includes(r));
    return { ok: missing.length === 0, granted, missing };
  } catch (err) {
    return { ok: false, granted: [], missing: REQUIRED, error: err.message };
  }
}

/**
 * GET /api/pages/health — Kiểm tra sức khỏe tất cả Fanpage của shop
 * Chạy parallel checks cho từng page: token, webhook, permissions, last_message
 */
router.get('/health', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;

    const pages = await db.all(
      `SELECT id, page_id, page_name, platform, access_token, status, is_ai_active, connected_at
       FROM ShopIntegrations
       WHERE shop_id = ? AND platform LIKE 'facebook%' AND page_id IS NOT NULL
       ORDER BY connected_at DESC`,
      [shopId]
    );

    if (pages.length === 0) return res.json([]);

    // Lấy tin nhắn cuối cùng nhận được cho mỗi page
    const pageIds = pages.map(p => p.page_id);
    const placeholders = pageIds.map(() => '?').join(',');
    const lastMsgs = await db.all(
      `SELECT page_id, MAX(timestamp) as last_message_at
       FROM Messages
       WHERE shop_id = ? AND page_id IN (${placeholders})
       GROUP BY page_id`,
      [shopId, ...pageIds]
    );
    const lastMsgMap = Object.fromEntries(lastMsgs.map(m => [m.page_id, m.last_message_at]));

    // Chạy parallel health checks cho tất cả pages
    const healthResults = await Promise.all(pages.map(async (page) => {
      const token = page.access_token;
      const isConnected = page.status === 'connected';

      if (!token || !isConnected) {
        return {
          id: page.id, page_id: page.page_id, page_name: page.page_name,
          platform: page.platform, is_ai_active: page.is_ai_active,
          connected_at: page.connected_at,
          token_alive: false, token_error: 'Không có token hoặc chưa kết nối',
          webhook_subscribed: false, webhook_fields: [],
          permissions_ok: false, permissions_missing: [],
          last_message_at: lastMsgMap[page.page_id] || null,
          overall: 'disconnected',
        };
      }

      // Parallel check token + webhook + permissions
      const [tokenHealth, webhookHealth, permHealth] = await Promise.all([
        checkTokenHealth(page.page_id, token),
        checkWebhookSubscription(page.page_id, token),
        checkPermissions(token),
      ]);

      const overall = !tokenHealth.alive ? 'error'
        : !webhookHealth.subscribed ? 'warning'
        : !permHealth.ok ? 'warning'
        : 'healthy';

      return {
        id: page.id,
        page_id: page.page_id,
        page_name: page.page_name,
        platform: page.platform,
        is_ai_active: !!page.is_ai_active,
        connected_at: page.connected_at,
        // Token
        token_alive: tokenHealth.alive,
        token_error: tokenHealth.error || null,
        token_error_code: tokenHealth.code || null,
        fan_count: tokenHealth.fan_count || null,
        // Webhook
        webhook_subscribed: webhookHealth.subscribed,
        webhook_fields: webhookHealth.fields || [],
        webhook_error: webhookHealth.error || null,
        // Permissions
        permissions_ok: permHealth.ok,
        permissions_granted: permHealth.granted || [],
        permissions_missing: permHealth.missing || [],
        // Activity
        last_message_at: lastMsgMap[page.page_id] || null,
        // Summary
        overall,
      };
    }));

    res.json(healthResults);
  } catch (err) {
    console.error('[PAGE HEALTH]', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/pages — Danh sách Fanpage của shop (đọc từ ShopIntegrations)
 */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const pages = await db.all(
      `SELECT id, page_id, page_name, platform, status as is_active, connected_at as created_at
       FROM ShopIntegrations
       WHERE shop_id = ? AND platform LIKE 'facebook%'
       ORDER BY connected_at DESC`,
      [req.shop.shopId]
    );
    // Map status 'connected' → is_active: 1 cho frontend
    res.json(pages.map(p => ({ ...p, is_active: p.is_active === 'connected' ? 1 : 0 })));
  } catch (error) {
    console.error('[PAGES GET]', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/pages — Thêm Fanpage thủ công (manual token)
 *
 * FIX: Ghi vào ShopIntegrations (nguồn sự thật duy nhất),
 * thay vì Pages table cũ. Webhook và GET đều đọc ShopIntegrations.
 */
router.post('/', requireOwnerOrAdmin, checkPlanLimit('pages'), async (req, res) => {
  try {
    const { page_id, page_name, page_access_token, platform } = req.body;

    if (!page_id || !page_access_token) {
      return res.status(400).json({ error: 'page_id và page_access_token là bắt buộc.' });
    }

    const db      = getDB();
    const shopId  = req.shop.shopId;
    const pName   = page_name || 'Facebook Page';
    const plat    = platform || 'facebook';

    // Platform key theo chuẩn đa Fanpage: facebook_<pageId>
    const platformKey = `${plat}_${page_id}`;

    // Upsert vào ShopIntegrations — consistent với OAuth flow
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
    `, [shopId, platformKey, page_access_token, pName, page_id]);

    // Lấy row vừa upsert để trả về id
    const row = await db.get(
      'SELECT id FROM ShopIntegrations WHERE shop_id = ? AND platform = ?',
      [shopId, platformKey]
    );

    // Cũng cập nhật Shops.facebook_page_id (legacy) nếu chưa có
    const shopRow = await db.get('SELECT facebook_page_id FROM Shops WHERE id = ?', [shopId]);
    if (!shopRow?.facebook_page_id) {
      await db.run(
        'UPDATE Shops SET facebook_page_id = ?, page_access_token = ? WHERE id = ?',
        [page_id, page_access_token, shopId]
      );
    }

    console.log(`[PAGES] ✅ Upsert page "${pName}" (${page_id}) vào ShopIntegrations cho Shop #${shopId}`);
    res.status(201).json({ id: row?.id, page_id, page_name: pName });
  } catch (error) {
    console.error('[PAGES POST]', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /api/pages/:id — Toggle active / đổi tên
 * Cập nhật trên ShopIntegrations (NOT Pages table)
 */
router.put('/:id', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { is_active, page_name } = req.body;
    const db = getDB();

    // Chuyển is_active (0/1) sang status ('connected'/'disconnected')
    const statusVal = typeof is_active !== 'undefined'
      ? (is_active ? 'connected' : 'disconnected')
      : undefined;

    await db.run(
      `UPDATE ShopIntegrations
       SET status     = COALESCE(?, status),
           page_name  = COALESCE(?, page_name)
       WHERE id = ? AND shop_id = ?`,
      [statusVal ?? null, page_name ?? null, req.params.id, req.shop.shopId]
    );

    writeAudit({ shopId: req.shop.shopId, actorId: req.shop.staffId, actorRole: req.shop.role, action: 'UPDATE_PAGE', resource: 'ShopIntegrations', resourceId: req.params.id, ip: getClientIp(req) });
    res.json({ message: 'Đã cập nhật.' });
  } catch (error) {
    console.error('[PAGES PUT]', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /api/pages/:id — Xóa Fanpage
 * Xóa từ ShopIntegrations (NOT Pages table)
 */
router.delete('/:id', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    await db.run(
      'DELETE FROM ShopIntegrations WHERE id = ? AND shop_id = ?',
      [req.params.id, req.shop.shopId]
    );
    writeAudit({ shopId: req.shop.shopId, actorId: req.shop.staffId, actorRole: req.shop.role, action: 'DISCONNECT_PAGE', resource: 'ShopIntegrations', resourceId: req.params.id, ip: getClientIp(req) });
    res.json({ message: 'Đã xóa.' });
  } catch (error) {
    console.error('[PAGES DELETE]', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
