'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { sendCapiEvent } = require('../../services/facebookCapiService');
const crypto = require('crypto');

const router = express.Router();
router.use(authMiddleware);

/** GET /api/orders/shop-settings — Lấy cấu hình phí ship mặc định */
router.get('/shop-settings', async (req, res) => {
  try {
    const db = getDB();
    const shop = await db.get('SELECT default_shipping_fee, free_shipping_threshold FROM Shops WHERE id = ?', [req.shop.shopId]);
    res.json({
      default_shipping_fee: shop?.default_shipping_fee ?? 30000,
      free_shipping_threshold: shop?.free_shipping_threshold ?? 500000,
    });
  } catch (error) {
    console.error('[ORDERS] Lỗi lấy settings:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PATCH /api/orders/shop-settings — Cập nhật cấu hình phí ship */
router.patch('/shop-settings', async (req, res) => {
  try {
    const db = getDB();
    const { default_shipping_fee, free_shipping_threshold } = req.body;
    const fee = Math.max(0, parseInt(default_shipping_fee) || 0);
    const threshold = Math.max(0, parseInt(free_shipping_threshold) || 0);
    await db.run('UPDATE Shops SET default_shipping_fee = ?, free_shipping_threshold = ? WHERE id = ?', [fee, threshold, req.shop.shopId]);
    res.json({ message: 'Đã cập nhật cài đặt phí ship.', default_shipping_fee: fee, free_shipping_threshold: threshold });
  } catch (error) {
    console.error('[ORDERS] Lỗi cập nhật settings:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/orders — Tạo đơn hàng mới (E-commerce pricing: subtotal + shipping - discount) */
router.post('/', async (req, res) => {
  try {
    const { customer_id, items, note, customer_phone, customer_address, discount_amount, discount_type, shipping_fee, recipient_name } = req.body;

    if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customer_id và items[] là bắt buộc.' });
    }

    const db = getDB();
    const shopId = req.shop.shopId;

    // Resolve items
    const resolvedItems = [];
    for (const item of items) {
      if (item.product_id) {
        const product = await db.get('SELECT * FROM Products WHERE id = ? AND shop_id = ?', [item.product_id, shopId]);
        if (!product) return res.status(400).json({ error: `Sản phẩm #${item.product_id} không tồn tại.` });
        if (product.stock_quantity < (item.quantity || 1)) {
          return res.status(400).json({ error: `"${product.name}" chỉ còn ${product.stock_quantity} sản phẩm.` });
        }
        resolvedItems.push({ product_id: product.id, name: product.name, quantity: item.quantity || 1, price: product.price });
      } else {
        resolvedItems.push({ product_id: null, name: item.name, quantity: item.quantity || 1, price: item.price || 0 });
      }
    }

    // ★ E-COMMERCE PRICING (Server-side bắt buộc)
    const subtotal = resolvedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const finalShippingFee = Math.max(0, parseInt(shipping_fee) || 0);

    // Discount: FIXED (VNĐ) hoặc PERCENT (%)
    const dType = discount_type === 'PERCENT' ? 'PERCENT' : 'FIXED';
    const rawDiscount = Math.max(0, parseFloat(discount_amount) || 0);
    let calculatedDiscount = 0;
    if (dType === 'PERCENT') {
      if (rawDiscount > 100) return res.status(400).json({ error: 'Phần trăm giảm giá tối đa 100%.' });
      calculatedDiscount = Math.round(subtotal * rawDiscount / 100);
    } else {
      calculatedDiscount = Math.round(rawDiscount);
    }
    if (calculatedDiscount > subtotal + finalShippingFee) {
      return res.status(400).json({ error: 'Số tiền giảm giá không hợp lệ (lớn hơn tổng đơn).' });
    }

    // ★ total = subtotal + shipping - discount
    const totalAmount = subtotal + finalShippingFee - calculatedDiscount;

    const orderResult = await db.run(
      `INSERT INTO Orders (shop_id, customer_id, total_amount, subtotal, shipping_fee, discount_amount, discount_type, note, created_by_id, recipient_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [shopId, customer_id, totalAmount, subtotal, finalShippingFee, calculatedDiscount, dType, note || null, req.shop.staffId || null, recipient_name || null]
    );
    const orderId = orderResult.lastID;

    for (const item of resolvedItems) {
      await db.run('INSERT INTO OrderItems (order_id, product_id, name, quantity, price) VALUES (?, ?, ?, ?, ?)',
        [orderId, item.product_id || null, item.name, item.quantity, item.price]);
      if (item.product_id) {
        await db.run('UPDATE Products SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantity, item.product_id]);
      }
    }

    if (customer_phone || customer_address) {
      const updates = [], vals = [];
      if (customer_phone) { updates.push('phone = ?'); vals.push(customer_phone); }
      if (customer_address) { updates.push('address = ?'); vals.push(customer_address); }
      vals.push(customer_id, shopId);
      await db.run(`UPDATE Customers SET ${updates.join(', ')} WHERE id = ? AND shop_id = ?`, vals);
    }

    console.log(`[ORDERS] Shop #${shopId} đơn #${orderId} — Sub:${subtotal} + Ship:${finalShippingFee} - Disc:${calculatedDiscount}(${dType}) = ${totalAmount}đ`);

    // CAPI Event
    db.get('SELECT phone FROM Customers WHERE id = ?', [customer_id]).then(customer => {
      const finalPhone = customer_phone || customer?.phone;
      if (finalPhone) {
        sendCapiEvent({ shopId, eventName: 'Purchase', phone: finalPhone, eventId: crypto.randomUUID(),
          customData: { value: totalAmount, currency: 'VND', order_id: String(orderId) }
        }).catch(err => console.error('[CAPI Trigger] Purchase Error:', err.message));
      }
    });

    res.status(201).json({
      id: orderId, shop_id: shopId, customer_id, subtotal, shipping_fee: finalShippingFee,
      discount_amount: calculatedDiscount, discount_type: dType, total_amount: totalAmount,
      recipient_name: recipient_name || null,
      status: 'pending', note: note || null, items: resolvedItems, created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ORDERS] Lỗi tạo đơn:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** GET /api/orders — Danh sách đơn hàng (Pagination + Search + Filter) */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const {
      page = 1,
      limit = 20,
      status,
      shipping_provider,
      search,
      sort = 'created_at',
      order = 'DESC',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions = ['o.shop_id = ?'];
    const params = [shopId];

    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }

    if (shipping_provider) {
      conditions.push('o.shipping_provider = ?');
      params.push(shipping_provider);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push('(CAST(o.id AS TEXT) LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR o.tracking_code LIKE ?)');
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.join(' AND ');

    // Validate sort column to prevent SQL injection
    const allowedSorts = ['created_at', 'total_amount', 'status', 'id'];
    const sortCol = allowedSorts.includes(sort) ? `o.${sort}` : 'o.created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Count total for pagination
    const countSQL = `SELECT COUNT(*) as total FROM Orders o LEFT JOIN Customers c ON o.customer_id = c.id WHERE ${whereClause}`;
    const countResult = await db.get(countSQL, params);
    const total = countResult?.total || 0;

    // Main query with pagination
    const dataSQL = `
      SELECT o.*, 
        c.name as customer_name, 
        c.phone as customer_phone, 
        c.address as customer_address,
        c.platform as customer_platform,
        c.avatar_url as customer_avatar
      FROM Orders o 
      LEFT JOIN Customers c ON o.customer_id = c.id 
      WHERE ${whereClause}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limitNum, offset];
    const orders = await db.all(dataSQL, dataParams);

    // Batch load items for all orders (avoid N+1)
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const placeholders = orderIds.map(() => '?').join(',');
      const allItems = await db.all(
        `SELECT oi.*, p.image_url as product_image 
         FROM OrderItems oi 
         LEFT JOIN Products p ON oi.product_id = p.id 
         WHERE oi.order_id IN (${placeholders})`,
        orderIds
      );

      // Group items by order_id
      const itemsByOrder = {};
      for (const item of allItems) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push(item);
      }

      for (const order of orders) {
        order.items = itemsByOrder[order.id] || [];
      }
    }

    res.json({
      data: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[ORDERS] Lỗi:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** GET /api/orders/customer/:customerId — Lịch sử đơn hàng của 1 khách */
router.get('/customer/:customerId', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;

    const orders = await db.all(
      'SELECT * FROM Orders WHERE customer_id = ? AND shop_id = ? ORDER BY created_at DESC',
      [req.params.customerId, shopId]
    );

    // Load items cho mỗi đơn
    for (const order of orders) {
      order.items = await db.all('SELECT * FROM OrderItems WHERE order_id = ?', [order.id]);
    }

    res.json(orders);
  } catch (error) {
    console.error('[ORDERS] Lỗi lấy đơn hàng:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** GET /api/orders/:id — Chi tiết 1 đơn hàng */
router.get('/:id', async (req, res) => {
  try {
    const db = getDB();
    const order = await db.get('SELECT o.*, c.name as customer_name, c.phone as customer_phone FROM Orders o LEFT JOIN Customers c ON o.customer_id = c.id WHERE o.id = ? AND o.shop_id = ?', [req.params.id, req.shop.shopId]);
    if (!order) return res.status(404).json({ error: 'Đơn hàng không tồn tại.' });
    order.items = await db.all('SELECT oi.*, p.image_url as product_image FROM OrderItems oi LEFT JOIN Products p ON oi.product_id = p.id WHERE oi.order_id = ?', [order.id]);
    res.json(order);
  } catch (error) {
    console.error('[ORDERS] Lỗi:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PATCH /api/orders/:id — Chỉnh sửa đơn hàng (E-commerce pricing) */
router.patch('/:id', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const orderId = req.params.id;
    const { note, customer_phone, customer_address, items, discount_amount, discount_type, shipping_fee, recipient_name } = req.body;

    // Verify order belongs to shop
    const order = await db.get('SELECT * FROM Orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) return res.status(404).json({ error: 'Đơn hàng không tồn tại.' });

    // Update note & recipient_name
    if (note !== undefined || recipient_name !== undefined) {
      const fields = [], vals = [];
      if (note !== undefined) { fields.push('note = ?'); vals.push(note); }
      if (recipient_name !== undefined) { fields.push('recipient_name = ?'); vals.push(recipient_name); }
      if (fields.length > 0) {
        vals.push(orderId, shopId);
        await db.run(`UPDATE Orders SET ${fields.join(', ')} WHERE id = ? AND shop_id = ?`, vals);
      }
    }

    // Update Customer phone/address  
    if (order.customer_id && (customer_phone !== undefined || customer_address !== undefined)) {
      const custUpdates = [], custVals = [];
      if (customer_phone !== undefined) { custUpdates.push('phone = ?'); custVals.push(customer_phone); }
      if (customer_address !== undefined) { custUpdates.push('address = ?'); custVals.push(customer_address); }
      if (custUpdates.length > 0) {
        custUpdates.push('updated_at = CURRENT_TIMESTAMP');
        custVals.push(order.customer_id, shopId);
        await db.run(`UPDATE Customers SET ${custUpdates.join(', ')} WHERE id = ? AND shop_id = ?`, custVals);
      }
    }

    // Update items if provided (replace strategy) + recalculate pricing
    if (items && Array.isArray(items) && items.length > 0) {
      // Restore old stock
      const oldItems = await db.all('SELECT * FROM OrderItems WHERE order_id = ?', [orderId]);
      for (const oi of oldItems) {
        if (oi.product_id) {
          await db.run('UPDATE Products SET stock_quantity = stock_quantity + ? WHERE id = ? AND shop_id = ?', [oi.quantity, oi.product_id, shopId]);
        }
      }
      await db.run('DELETE FROM OrderItems WHERE order_id = ?', [orderId]);

      // Insert new items + deduct stock
      let recalcSubtotal = 0;
      for (const item of items) {
        await db.run(
          'INSERT INTO OrderItems (order_id, product_id, name, quantity, price) VALUES (?, ?, ?, ?, ?)',
          [orderId, item.product_id || null, item.name, item.quantity || 1, item.price || 0]
        );
        recalcSubtotal += (item.price || 0) * (item.quantity || 1);
        if (item.product_id) {
          await db.run('UPDATE Products SET stock_quantity = stock_quantity - ? WHERE id = ? AND shop_id = ?', [item.quantity || 1, item.product_id, shopId]);
        }
      }

      // ★ Recalculate: total = subtotal + shipping - discount
      const newShippingFee = shipping_fee !== undefined ? Math.max(0, parseInt(shipping_fee) || 0) : (order.shipping_fee || 0);
      const dType = discount_type || order.discount_type || 'FIXED';
      const rawDiscount = discount_amount !== undefined ? Math.max(0, parseFloat(discount_amount) || 0) : (order.discount_amount || 0);
      let calculatedDiscount = 0;
      if (dType === 'PERCENT') {
        calculatedDiscount = Math.round(recalcSubtotal * Math.min(rawDiscount, 100) / 100);
      } else {
        calculatedDiscount = Math.min(Math.round(rawDiscount), recalcSubtotal + newShippingFee);
      }
      const finalTotal = recalcSubtotal + newShippingFee - calculatedDiscount;

      await db.run(
        'UPDATE Orders SET total_amount = ?, subtotal = ?, shipping_fee = ?, discount_amount = ?, discount_type = ? WHERE id = ? AND shop_id = ?',
        [finalTotal, recalcSubtotal, newShippingFee, calculatedDiscount, dType, orderId, shopId]
      );
    } else if (discount_amount !== undefined || shipping_fee !== undefined || discount_type !== undefined) {
      // Update pricing without changing items
      const currentSubtotal = order.subtotal || order.total_amount || 0;
      const newShippingFee = shipping_fee !== undefined ? Math.max(0, parseInt(shipping_fee) || 0) : (order.shipping_fee || 0);
      const dType = discount_type || order.discount_type || 'FIXED';
      const rawDiscount = discount_amount !== undefined ? Math.max(0, parseFloat(discount_amount) || 0) : (order.discount_amount || 0);
      let calculatedDiscount = 0;
      if (dType === 'PERCENT') {
        calculatedDiscount = Math.round(currentSubtotal * Math.min(rawDiscount, 100) / 100);
      } else {
        calculatedDiscount = Math.min(Math.round(rawDiscount), currentSubtotal + newShippingFee);
      }
      const finalTotal = currentSubtotal + newShippingFee - calculatedDiscount;

      await db.run(
        'UPDATE Orders SET total_amount = ?, shipping_fee = ?, discount_amount = ?, discount_type = ? WHERE id = ? AND shop_id = ?',
        [finalTotal, newShippingFee, calculatedDiscount, dType, orderId, shopId]
      );
    }

    console.log(`[ORDERS] ✏️ Đơn #${orderId} đã được chỉnh sửa bởi Shop #${shopId}`);

    // Return updated order
    const updated = await db.get(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
       FROM Orders o LEFT JOIN Customers c ON o.customer_id = c.id
       WHERE o.id = ? AND o.shop_id = ?`,
      [orderId, shopId]
    );
    updated.items = await db.all('SELECT * FROM OrderItems WHERE order_id = ?', [orderId]);

    res.json({ message: 'Đã cập nhật đơn hàng.', order: updated });
  } catch (error) {
    console.error('[ORDERS] Lỗi chỉnh sửa đơn:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** PATCH /api/orders/:id/status — Cập nhật trạng thái đơn */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'shipping', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status phải là: ${validStatuses.join(', ')}` });
    }

    const db = getDB();
    await db.run(
      'UPDATE Orders SET status = ? WHERE id = ? AND shop_id = ?',
      [status, req.params.id, req.shop.shopId]
    );

    res.json({ message: 'Đã cập nhật trạng thái.' });
  } catch (error) {
    console.error('[ORDERS] Lỗi cập nhật:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** POST /api/orders/:id/ship — Đẩy đơn sang Hãng Vận Chuyển lấy mã vận đơn */
router.post('/:id/ship', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const orderId = req.params.id;
    const { provider, weight, cod_amount, shipper_note, pick_name, pick_address, pick_province, pick_district, pick_tel, vtp_service, ghn_service_type_id, ghn_required_note } = req.body;

    if (!provider || !['GHTK', 'GHN', 'VIETTEL_POST'].includes(provider)) {
      return res.status(400).json({ error: 'provider phải là GHTK, GHN hoặc VIETTEL_POST.' });
    }

    // Load đơn hàng
    const order = await db.get('SELECT * FROM Orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) return res.status(404).json({ error: 'Đơn hàng không tồn tại.' });
    if (order.tracking_code) return res.status(400).json({ error: `Đơn đã có mã vận đơn: ${order.tracking_code}` });

    // Load khách hàng
    const customer = await db.get('SELECT * FROM Customers WHERE id = ?', [order.customer_id]);
    if (!customer?.phone) return res.status(400).json({ error: 'Khách hàng chưa có SĐT. Vui lòng cập nhật trước khi đẩy đơn.' });
    if (!customer?.address) return res.status(400).json({ error: 'Khách hàng chưa có địa chỉ giao hàng. Vui lòng cập nhật.' });

    // Load items
    const items = await db.all('SELECT * FROM OrderItems WHERE order_id = ?', [orderId]);

    // Lấy Token Vận chuyển từ ShopIntegrations
    const integration = await db.get(
      'SELECT access_token, metadata FROM ShopIntegrations WHERE shop_id = ? AND platform = ?',
      [shopId, provider.toLowerCase()]
    );
    const carrierToken = integration ? integration.access_token : '';
    const savedMeta = integration?.metadata ? JSON.parse(integration.metadata) : {};
    const sender = savedMeta.sender || {};

    // Gọi GHTK/GHN/VTP API qua Service
    const { pushOrderToCarrier } = require('../services/shippingService');
    const result = await pushOrderToCarrier(provider, carrierToken, {
      id: orderId,
      pick_name: pick_name || sender.name || 'My Shop',
      pick_address: pick_address || sender.address || '',
      pick_province: pick_province || sender.province || 'Hồ Chí Minh',
      pick_district: pick_district || sender.district || 'Quận 1',
      pick_tel: pick_tel || sender.phone || '',
      name: order.recipient_name || customer.name || 'Khách hàng',
      tel: customer.phone,
      address: customer.address,
      province: 'Hồ Chí Minh',
      district: 'Quận 1',
      pick_money: cod_amount !== undefined ? cod_amount : order.total_amount,
      total_amount: order.total_amount,
      weight: weight || savedMeta.default_weight || 500,
      note: shipper_note || order.note || '',
      products: items.map((i) => ({ name: i.name, quantity: i.quantity, weight: weight || savedMeta.default_weight || 500 })),
      // VTP-specific
      vtp_service: vtp_service || savedMeta.service || 'VCN',
      // GHN-specific
      ghn_service_type_id: ghn_service_type_id || savedMeta.service_type_id || 2,
      ghn_required_note: ghn_required_note || savedMeta.required_note || 'CHOXEMHANGKHONGTHU',
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Hãng vận chuyển từ chối tạo đơn' });
    }

    // Lưu tracking vào DB
    await db.run(
      `UPDATE Orders SET tracking_code = ?, shipping_provider = ?, shipping_status = ?, status = 'shipping', shipped_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [result.tracking_code, provider, 'Đã tạo đơn', orderId]
    );

    // Tự động nhắn tin cho khách
    const notiText = `Dạ shop đã lên đơn thành công, mã vận đơn của bạn là: ${result.tracking_code}. Bạn chờ nhận hàng nhé! 🚚`;
    const msgResult = await db.run(
      'INSERT INTO Messages (shop_id, customer_id, sender, text, type) VALUES (?, ?, ?, ?, ?)',
      [shopId, order.customer_id, 'bot', notiText, 'inbox']
    );

    // Emit real-time
    const { getIO } = require('../../infra/socket/socketManager');
    const io = getIO();
    if (io) {
      io.emit('new_message', {
        id: msgResult.lastID, shop_id: shopId, customer_id: order.customer_id,
        sender: 'bot', text: notiText, type: 'inbox', timestamp: new Date().toISOString(),
      });
    }

    // Gửi thực tế qua Facebook nếu có
    if (customer.platform === 'facebook') {
      const shop = await db.get('SELECT page_access_token FROM Shops WHERE id = ?', [shopId]);
      if (shop?.page_access_token) {
        try {
          await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${shop.page_access_token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: { id: customer.platform_id }, message: { text: notiText } }),
          });
        } catch { /* silent */ }
      }
    }

    console.log(`[SHIP] ✅ Đơn #${orderId} → GHTK: ${result.tracking_code}`);

    res.json({ success: true, tracking_code: result.tracking_code, fee: result.fee, estimated_delivery: result.estimated_delivery, is_mock: result.is_mock });
  } catch (error) {
    console.error('[ORDERS] Lỗi tạo mã vận đơn:', error.message);
    res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
});

module.exports = router;
