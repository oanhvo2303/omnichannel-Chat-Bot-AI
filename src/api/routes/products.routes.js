'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

/**
 * Validate volume_pricing tiers.
 */
function validateVolumePricing(tiers, basePrice) {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return null;

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
    const result = products.map(p => ({
      ...p,
      volume_pricing: parseVolumePricing(p.volume_pricing),
      attributes: p.attributes ? (() => { try { return JSON.parse(p.attributes); } catch { return []; } })() : [],
      images: p.images ? (() => { try { return JSON.parse(p.images); } catch { return []; } })() : [],
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
    const { name, sku, price, stock_quantity, image_url, volume_pricing, description, attributes, images } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên sản phẩm là bắt buộc.' });

    // FIX: Reject giá = 0 hoặc âm (trước đây fallback về 0 gây đơn hàng sai)
    const basePrice = Number(price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return res.status(400).json({ error: 'Giá sản phẩm phải lớn hơn 0.' });
    }

    const stockQty = Number(stock_quantity);
    if (!Number.isFinite(stockQty) || stockQty < 0 || !Number.isInteger(stockQty)) {
      return res.status(400).json({ error: 'Số lượng tồn kho phải là số nguyên không âm.' });
    }

    const tiers = Array.isArray(volume_pricing) && volume_pricing.length > 0 ? volume_pricing : null;
    if (tiers) {
      const err = validateVolumePricing(tiers, basePrice);
      if (err) return res.status(400).json({ error: `Giá sỉ không hợp lệ: ${err}` });
    }

    const attrsJson = Array.isArray(attributes) && attributes.length > 0 ? JSON.stringify(attributes) : null;
    // images: array of URLs; first image is also set as image_url for backward compat
    const imagesArr = Array.isArray(images) && images.length > 0 ? images : (image_url ? [image_url] : []);
    const primaryImage = image_url || imagesArr[0] || null;
    const imagesJson = imagesArr.length > 0 ? JSON.stringify(imagesArr) : null;

    const db = getDB();
    const result = await db.run(
      'INSERT INTO Products (shop_id, name, sku, price, stock_quantity, image_url, volume_pricing, description, attributes, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.shop.shopId, name.trim(), sku || null, basePrice, stockQty, primaryImage, tiers ? JSON.stringify(tiers) : null, description || null, attrsJson, imagesJson]
    );

    res.status(201).json({
      id: result.lastID, shop_id: req.shop.shopId,
      name: name.trim(), sku, price: basePrice,
      stock_quantity: stockQty, image_url: primaryImage,
      description: description || null,
      attributes: attributes || [],
      images: imagesArr,
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
    const { name, sku, price, stock_quantity, image_url, volume_pricing, description, attributes, images } = req.body;
    // FIX: Reject giá = 0 hoặc âm khi update
    const basePrice = Number(price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return res.status(400).json({ error: 'Giá sản phẩm phải lớn hơn 0.' });
    }
    const stockQty = Number(stock_quantity);
    if (!Number.isFinite(stockQty) || stockQty < 0 || !Number.isInteger(stockQty)) {
      return res.status(400).json({ error: 'Số lượng tồn kho phải là số nguyên không âm.' });
    }

    const tiers = Array.isArray(volume_pricing) && volume_pricing.length > 0 ? volume_pricing : null;
    if (tiers) {
      const err = validateVolumePricing(tiers, basePrice);
      if (err) return res.status(400).json({ error: `Giá sỉ không hợp lệ: ${err}` });
    }

    const attrsJson = Array.isArray(attributes) && attributes.length > 0 ? JSON.stringify(attributes) : null;
    const imagesArr = Array.isArray(images) && images.length > 0 ? images : (image_url ? [image_url] : []);
    const primaryImage = image_url || imagesArr[0] || null;
    const imagesJson = imagesArr.length > 0 ? JSON.stringify(imagesArr) : null;

    const db = getDB();
    await db.run(
      'UPDATE Products SET name=?, sku=?, price=?, stock_quantity=?, image_url=?, volume_pricing=?, description=?, attributes=?, images=? WHERE id=? AND shop_id=?',
      [name, sku || null, basePrice, stockQty, primaryImage, tiers ? JSON.stringify(tiers) : null, description || null, attrsJson, imagesJson, req.params.id, req.shop.shopId]
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
