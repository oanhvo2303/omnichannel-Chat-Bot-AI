'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');
const { writeAudit, getClientIp } = require('../services/auditService');

const router = express.Router();
router.use(authMiddleware);

// =============================================
// CRUD Tags
// =============================================

/** GET /api/tags — Danh sách tags của Shop */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const tags = await db.all('SELECT * FROM Tags WHERE shop_id = ? ORDER BY name', [req.shop.shopId]);
    res.json(tags);
  } catch (error) {
    console.error('[TAGS] Lỗi lấy tags:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/tags — Tạo tag mới (owner/admin only) */
router.post('/', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên tag là bắt buộc.' });

    const db = getDB();
    const result = await db.run(
      'INSERT INTO Tags (shop_id, name, color) VALUES (?, ?, ?)',
      [req.shop.shopId, name.trim(), color || '#3B82F6']
    );

    writeAudit({ shopId: req.shop.shopId, actorId: req.shop.staffId, actorRole: req.shop.role,
      action: 'CREATE_TAG', resource: 'Tags', resourceId: result.lastID,
      detail: { name: name.trim(), color }, ip: getClientIp(req) });

    res.status(201).json({ id: result.lastID, shop_id: req.shop.shopId, name: name.trim(), color: color || '#3B82F6' });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Tag này đã tồn tại.' });
    }
    console.error('[TAGS] Lỗi tạo tag:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** DELETE /api/tags/:id — Xóa tag (owner/admin only) */
router.delete('/:id', requireOwnerOrAdmin, async (req, res) => {
  try {
    const db = getDB();
    await db.run('DELETE FROM Tags WHERE id = ? AND shop_id = ?', [req.params.id, req.shop.shopId]);
    writeAudit({ shopId: req.shop.shopId, actorId: req.shop.staffId, actorRole: req.shop.role,
      action: 'DELETE_TAG', resource: 'Tags', resourceId: req.params.id, ip: getClientIp(req) });
    res.json({ message: 'Đã xóa tag.' });
  } catch (error) {
    console.error('[TAGS] Lỗi xóa tag:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PUT /api/tags/:id — Cập nhật tag (owner/admin only) */
router.put('/:id', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên tag là bắt buộc.' });

    const db = getDB();
    const result = await db.run(
      'UPDATE Tags SET name = ?, color = ? WHERE id = ? AND shop_id = ?',
      [name.trim(), color || '#3B82F6', req.params.id, req.shop.shopId]
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Tag không tồn tại.' });
    res.json({ message: 'Đã cập nhật tag.', tag: { id: Number(req.params.id), name: name.trim(), color: color || '#3B82F6' } });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Tên tag đã tồn tại.' });
    }
    console.error('[TAGS] Lỗi cập nhật tag:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =============================================
// Gắn / Gỡ tag cho Customer
// =============================================

/** GET /api/tags/customer/:customerId — Lấy tags của 1 khách */
router.get('/customer/:customerId', async (req, res) => {
  try {
    const db = getDB();
    const tags = await db.all(`
      SELECT t.* FROM Tags t
      INNER JOIN CustomerTags ct ON t.id = ct.tag_id
      WHERE ct.customer_id = ? AND t.shop_id = ?
    `, [req.params.customerId, req.shop.shopId]);
    res.json(tags);
  } catch (error) {
    console.error('[TAGS] Lỗi lấy customer tags:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/tags/customer/:customerId/:tagId — Gắn tag (staff + admin + owner) */
// Note: cho phép mọi staff, vì gắn tag là thao tác hàng ngày khi chat
router.post('/customer/:customerId/:tagId', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    // Bảo mật: Verify customer + tag thuộc shop
    const customer = await db.get('SELECT id FROM Customers WHERE id = ? AND shop_id = ?', [req.params.customerId, shopId]);
    if (!customer) return res.status(404).json({ error: 'Khách hàng không tồn tại.' });
    const tag = await db.get('SELECT id FROM Tags WHERE id = ? AND shop_id = ?', [req.params.tagId, shopId]);
    if (!tag) return res.status(404).json({ error: 'Tag không tồn tại.' });
    await db.run(
      'INSERT OR IGNORE INTO CustomerTags (customer_id, tag_id) VALUES (?, ?)',
      [req.params.customerId, req.params.tagId]
    );
    res.json({ message: 'Đã gắn tag.' });
  } catch (error) {
    console.error('[TAGS] Lỗi gắn tag:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** DELETE /api/tags/customer/:customerId/:tagId — Gỡ tag (staff + admin + owner) */
router.delete('/customer/:customerId/:tagId', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    // Bảo mật: Verify customer thuộc shop
    const customer = await db.get('SELECT id FROM Customers WHERE id = ? AND shop_id = ?', [req.params.customerId, shopId]);
    if (!customer) return res.status(404).json({ error: 'Khách hàng không tồn tại.' });
    await db.run(
      'DELETE FROM CustomerTags WHERE customer_id = ? AND tag_id = ?',
      [req.params.customerId, req.params.tagId]
    );
    res.json({ message: 'Đã gỡ tag.' });
  } catch (error) {
    console.error('[TAGS] Lỗi gỡ tag:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
