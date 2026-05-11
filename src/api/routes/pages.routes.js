'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');

const router = express.Router();
router.use(authMiddleware);

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
router.post('/', requireOwnerOrAdmin, async (req, res) => {
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
    res.json({ message: 'Đã xóa.' });
  } catch (error) {
    console.error('[PAGES DELETE]', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
