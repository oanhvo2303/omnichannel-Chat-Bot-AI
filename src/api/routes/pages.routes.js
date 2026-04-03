'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

/** GET /api/pages — Danh sách Fanpage của shop */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const pages = await db.all(
      "SELECT id, page_id, page_name, platform, status as is_active, connected_at as created_at FROM ShopIntegrations WHERE shop_id = ? AND platform LIKE 'facebook%' ORDER BY connected_at DESC",
      [req.shop.shopId]
    );
    // map status connected -> is_active 1
    res.json(pages.map(p => ({ ...p, is_active: p.is_active === 'connected' ? 1 : 0 })));
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/pages — Thêm Fanpage mới (manual hoặc sau OAuth) */
router.post('/', async (req, res) => {
  try {
    const { page_id, page_name, page_access_token, platform } = req.body;
    if (!page_id || !page_access_token) return res.status(400).json({ error: 'page_id và page_access_token là bắt buộc.' });

    const db = getDB();
    const shopId = req.shop.shopId;

    // Upsert
    const existing = await db.get('SELECT id FROM Pages WHERE shop_id = ? AND page_id = ?', [shopId, page_id]);
    if (existing) {
      await db.run('UPDATE Pages SET page_name = ?, page_access_token = ?, platform = ?, is_active = 1 WHERE id = ?',
        [page_name || 'Facebook Page', page_access_token, platform || 'facebook', existing.id]);
      return res.json({ message: 'Đã cập nhật Fanpage.', id: existing.id });
    }

    const result = await db.run(
      'INSERT INTO Pages (shop_id, page_id, page_name, page_access_token, platform) VALUES (?, ?, ?, ?, ?)',
      [shopId, page_id, page_name || 'Facebook Page', page_access_token, platform || 'facebook']
    );

    // Cũng cập nhật Shops.facebook_page_id nếu là page đầu tiên
    const count = await db.get('SELECT COUNT(*) as c FROM Pages WHERE shop_id = ?', [shopId]);
    if (count.c === 1) {
      await db.run('UPDATE Shops SET facebook_page_id = ?, page_access_token = ? WHERE id = ?',
        [page_id, page_access_token, shopId]);
    }

    console.log(`[PAGES] ✅ Thêm page "${page_name}" (${page_id}) cho Shop #${shopId}`);
    res.status(201).json({ id: result.lastID, page_id, page_name });
  } catch (error) {
    console.error('[PAGES]', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PUT /api/pages/:id — Toggle active */
router.put('/:id', async (req, res) => {
  try {
    const { is_active, page_name } = req.body;
    const db = getDB();
    await db.run('UPDATE Pages SET is_active = COALESCE(?, is_active), page_name = COALESCE(?, page_name) WHERE id = ? AND shop_id = ?',
      [is_active, page_name, req.params.id, req.shop.shopId]);
    res.json({ message: 'Đã cập nhật.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** DELETE /api/pages/:id */
router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    await db.run('DELETE FROM Pages WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    res.json({ message: 'Đã xóa.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
