'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

/**
 * Validate volume_pricing tiers.
 * Rules: min_qty tăng dần, price giảm dần, min_qty >= 2, price > 0.
 * @returns {string|null} Error message or null if valid.
 */
function validateVolumePricing(tiers, basePrice) {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return null; // Empty = disabled

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (!t.min_qty || !t.price) return `Mốc ${i + 1}: Thiếu min_qty hoặc price.`;
    if (typeof t.min_qty !== 'number' || t.min_qty < 2) return `Mốc ${i + 1}: Số lượng tối thiểu phải >= 2.`;
    if (typeof t.price !== 'number' || t.price <= 0) return `Mốc ${i + 1}: Giá phải > 0.`;
    if (t.price >= basePrice) return `Mốc ${i + 1}: Giá sỉ (${t.price.toLocaleString()}đ) phải nhỏ hơn giá gốc (${basePrice.toLocaleString()}đ).`;

    if (i > 0) {
      if (t.min_qty <= tiers[i - 1].min_qty) return `Mốc ${i + 1}: Số lượng phải lớn hơn mốc ${i} (${tiers[i - 1].min_qty}).`;
      if (t.price >= tiers[i - 1].price) return `Mốc ${i + 1}: Giá phải nhỏ hơn mốc ${i} (${tiers[i - 1].price.toLocaleString()}đ).`;
    }
  }
  return null;
}

/**
 * Parse volume_pricing from DB string to array.
 */
function parseVolumePricing(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch { return null; }
}

/** GET /api/products — Danh sách sản phẩm của Shop */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const { search } = req.query;
    let sql = 'SELECT * FROM Products WHERE shop_id = ?';
    const params = [req.shop.shopId];

    if (search) {
      sql += ' AND (name LIKE ? OR sku LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY name';

    const products = await db.all(sql, params);

    // Parse volume_pricing JSON for each product
    const result = products.map(p => ({
      ...p,
      volume_pricing: parseVolumePricing(p.volume_pricing),
    }));

    res.json(result);
  } catch (error) {
    console.error('[PRODUCTS] Lỗi:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/products — Thêm sản phẩm */
router.post('/', async (req, res) => {
  try {
    const { name, sku, price, stock_quantity, image_url, volume_pricing } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên sản phẩm là bắt buộc.' });

    const basePrice = Number(price) || 0;

    // Validate volume_pricing
    const tiers = Array.isArray(volume_pricing) && volume_pricing.length > 0 ? volume_pricing : null;
    if (tiers) {
      const err = validateVolumePricing(tiers, basePrice);
      if (err) return res.status(400).json({ error: `Giá sỉ không hợp lệ: ${err}` });
    }

    const db = getDB();
    const result = await db.run(
      'INSERT INTO Products (shop_id, name, sku, price, stock_quantity, image_url, volume_pricing) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.shop.shopId, name.trim(), sku || null, basePrice, stock_quantity || 0, image_url || null, tiers ? JSON.stringify(tiers) : null]
    );

    res.status(201).json({
      id: result.lastID, shop_id: req.shop.shopId,
      name: name.trim(), sku, price: basePrice,
      stock_quantity: stock_quantity || 0, image_url,
      volume_pricing: tiers,
    });
  } catch (error) {
    console.error('[PRODUCTS] Lỗi tạo:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PUT /api/products/:id — Cập nhật sản phẩm */
router.put('/:id', async (req, res) => {
  try {
    const { name, sku, price, stock_quantity, image_url, volume_pricing } = req.body;
    const basePrice = Number(price) || 0;

    // Validate volume_pricing
    const tiers = Array.isArray(volume_pricing) && volume_pricing.length > 0 ? volume_pricing : null;
    if (tiers) {
      const err = validateVolumePricing(tiers, basePrice);
      if (err) return res.status(400).json({ error: `Giá sỉ không hợp lệ: ${err}` });
    }

    const db = getDB();
    await db.run(
      'UPDATE Products SET name=?, sku=?, price=?, stock_quantity=?, image_url=?, volume_pricing=? WHERE id=? AND shop_id=?',
      [name, sku || null, basePrice, stock_quantity || 0, image_url || null, tiers ? JSON.stringify(tiers) : null, req.params.id, req.shop.shopId]
    );
    res.json({ message: 'Đã cập nhật.' });
  } catch (error) {
    console.error('[PRODUCTS] Lỗi cập nhật:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** DELETE /api/products/:id — Xóa sản phẩm */
router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    await db.run('DELETE FROM Products WHERE id=? AND shop_id=?', [req.params.id, req.shop.shopId]);
    res.json({ message: 'Đã xóa.' });
  } catch (error) {
    console.error('[PRODUCTS] Lỗi xóa:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
