'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { sendCapiEvent } = require('../../services/facebookCapiService');
const crypto = require('crypto');

const router = express.Router();

// Tất cả API routes yêu cầu JWT
router.use(authMiddleware);

/**
 * GET /api/customers/advanced
 * API dành riêng cho Dedicated CRM Dashboard.
 * Join với Orders để tính tổng tiền (LTV) và phân trang.
 */
router.get('/customers/advanced', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { search, tag_id, has_phone, customer_type, page = 1, limit = 20 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = ['c.shop_id = ?'];
    let params = [shopId];

    if (search) {
      conditions.push('(c.name LIKE ? OR c.phone LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (has_phone === '1') {
      conditions.push("c.phone IS NOT NULL AND c.phone != ''");
    }
    if (tag_id) {
      conditions.push('EXISTS (SELECT 1 FROM CustomerTags ct WHERE ct.customer_id = c.id AND ct.tag_id = ?)');
      params.push(tag_id);
    }
    if (customer_type === 'buyers') {
      conditions.push("EXISTS (SELECT 1 FROM Orders o WHERE o.customer_id = c.id AND o.status != 'cancelled')");
    } else if (customer_type === 'leads') {
      conditions.push("NOT EXISTS (SELECT 1 FROM Orders o WHERE o.customer_id = c.id AND o.status != 'cancelled')");
    }

    const whereClause = conditions.join(' AND ');

    // Đếm tổng số lượng record
    const countRow = await db.get(`SELECT COUNT(*) as total FROM Customers c WHERE ${whereClause}`, params);
    const totalRecords = countRow.total;

    // Lấy danh sách kết hợp Order Stats
    const qParams = [...params, parseInt(limit), parseInt(offset)];
    const customers = await db.all(`
      SELECT 
        c.id, c.name, c.avatar_url, c.phone, c.address, c.platform, c.created_at,
        COUNT(o.id) AS total_orders,
        SUM(o.total_amount) AS total_spent
      FROM Customers c
      LEFT JOIN Orders o ON c.id = o.customer_id AND o.status != 'cancelled'
      WHERE ${whereClause}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `, qParams);

    // Gắn Tags cho từng khách hàng
    for (const c of customers) {
      c.tags = await db.all(`
        SELECT t.id, t.name, t.color FROM Tags t
        INNER JOIN CustomerTags ct ON t.id = ct.tag_id
        WHERE ct.customer_id = ?
      `, [c.id]);
    }

    res.json({
      data: customers,
      pagination: {
        total: totalRecords,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(totalRecords / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[CRM ADV] Lỗi:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/customers
 * Trả danh sách khách hàng CỦA SHOP.
 * Query params: ?search=&has_phone=1&tag_id=
 */
router.get('/customers', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { search, has_phone, tag_id, page_id, message_type, assign_filter } = req.query;
    const userRole = req.shop.role;
    const staffId = req.shop.staffId;

    let conditions = ['c.shop_id = ?'];
    let params = [shopId];

    // ★ Page filter: lọc theo Fanpage
    if (page_id) {
      conditions.push('c.page_id = ?');
      params.push(page_id);
    }

    // ★ Role-based & Status filtering
    if (assign_filter === 'me' && staffId) {
      conditions.push('c.assigned_to = ?');
      params.push(staffId);
    } else if (assign_filter === 'unassigned') {
      conditions.push('c.assigned_to IS NULL');
    } else if (userRole === 'staff' && staffId) {
      // Default của luồng Staff
      conditions.push('(c.assigned_to = ? OR c.assigned_to IS NULL)');
      params.push(staffId);
    }

    // Tìm theo tên
    if (search) {
      conditions.push('c.name LIKE ?');
      params.push(`%${search}%`);
    }

    // Lọc có SĐT
    if (has_phone === '1') {
      conditions.push("c.phone IS NOT NULL AND c.phone != ''");
    }

    // Lọc theo Tag
    if (tag_id) {
      conditions.push('EXISTS (SELECT 1 FROM CustomerTags ct WHERE ct.customer_id = c.id AND ct.tag_id = ?)');
      params.push(tag_id);
    }

    const whereClause = conditions.join(' AND ');
    
    // Condition cho subquery messages
    let msgCondition = '';
    if (message_type === 'comment') {
      msgCondition = "AND type = 'comment'";
    } else if (message_type === 'inbox') {
      msgCondition = "AND type = 'inbox'";
    }

    const customers = await db.all(`
      SELECT
        c.*,
        m.text AS lastMessage,
        m.type AS lastMessageType,
        m.timestamp AS lastTime,
        s.name AS assigned_staff_name
      FROM Customers c
      LEFT JOIN (
      SELECT id, customer_id, text, type, timestamp
        FROM Messages
        WHERE id IN (
          SELECT MAX(id) FROM Messages WHERE id IS NOT NULL ${msgCondition} GROUP BY customer_id
        )
      ) m ON c.id = m.customer_id
      LEFT JOIN Staff s ON c.assigned_to = s.id
      WHERE ${whereClause} ${msgCondition ? 'AND m.id IS NOT NULL' : ''}
      ORDER BY m.timestamp DESC, c.created_at DESC
    `, params);

    // Load tags cho mỗi khách hàng
    for (const c of customers) {
      c.tags = await db.all(`
        SELECT t.id, t.name, t.color FROM Tags t
        INNER JOIN CustomerTags ct ON t.id = ct.tag_id
        WHERE ct.customer_id = ?
      `, [c.id]);
      c.unread = 0;
    }

    res.json(customers);
  } catch (error) {
    console.error('[API] Lỗi lấy danh sách khách hàng:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PATCH /api/customers/:id — Cập nhật thông tin khách hàng (Phone, Address, Note)
 */
router.patch('/customers/:id', async (req, res) => {
  try {
    const { phone, address, internal_note, name } = req.body;
    const db = getDB();
    const shopId = req.shop.shopId;

    // Check customer thuộc shop
    const customer = await db.get('SELECT id, phone, name FROM Customers WHERE id = ? AND shop_id = ?', [req.params.id, shopId]);
    if (!customer) return res.status(404).json({ error: 'Khách hàng không tồn tại.' });

    const updates = [];
    const vals = [];
    if (phone !== undefined) { updates.push('phone = ?'); vals.push(phone); }
    if (address !== undefined) { updates.push('address = ?'); vals.push(address); }
    if (internal_note !== undefined) { updates.push('internal_note = ?'); vals.push(internal_note); }
    if (name !== undefined) { updates.push('name = ?'); vals.push(name); }
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1) return res.json({ message: 'Không có gì thay đổi.' });

    vals.push(req.params.id, shopId);
    await db.run(`UPDATE Customers SET ${updates.join(', ')} WHERE id = ? AND shop_id = ?`, vals);

    const updated = await db.get('SELECT * FROM Customers WHERE id = ?', [req.params.id]);
    console.log(`[CRM] Cập nhật khách #${req.params.id}: phone=${phone}, address=${address?.substring(0, 20)}...`);

    // 🚀 Bắn CAPI Event (Lead) - Nếu số điện thoại thay đổi từ null -> có số
    if (phone && phone !== customer.phone) {
      sendCapiEvent({
        shopId,
        eventName: 'Lead',
        phone,
        eventId: crypto.randomUUID()
      }).catch(err => console.error('[CAPI Trigger] API Manual Error:', err.message));
    }

    res.json(updated);
  } catch (error) {
    console.error('[CRM] Lỗi cập nhật khách:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PATCH /api/customers/:id/ai-status — Bật/tắt AI riêng cho số khách này
 */
router.patch('/customers/:id/ai-status', async (req, res) => {
  try {
    const { is_ai_paused } = req.body;
    const db = getDB();
    const shopId = req.shop.shopId;

    const customer = await db.get('SELECT id FROM Customers WHERE id = ? AND shop_id = ?', [req.params.id, shopId]);
    if (!customer) return res.status(404).json({ error: 'Khách hàng không tồn tại.' });

    await db.run('UPDATE Customers SET is_ai_paused = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [is_ai_paused ? 1 : 0, req.params.id]);
    res.json({ success: true, is_ai_paused: is_ai_paused ? 1 : 0 });
  } catch (error) {
    console.error('[CRM] Lỗi toggle AI:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/customers/:id/transfer — Chuyển hội thoại sang Staff khác
 */
router.post('/customers/:id/transfer', async (req, res) => {
  try {
    const { staff_id } = req.body;
    if (!staff_id) return res.status(400).json({ error: 'staff_id là bắt buộc.' });

    const db = getDB();
    const shopId = req.shop.shopId;

    // Verify staff belongs to same shop
    const targetStaff = await db.get('SELECT id, name FROM Staff WHERE id = ? AND shop_id = ?', [staff_id, shopId]);
    if (!targetStaff) return res.status(404).json({ error: 'Nhân viên không tồn tại.' });

    await db.run('UPDATE Customers SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?', [staff_id, req.params.id, shopId]);

    const { getIO } = require('../../infra/socket/socketManager');
    const io = getIO();
    if (io) {
      io.to(String(shopId)).emit('customer_transferred', { customerId: req.params.id, staffId: targetStaff.id, staffName: targetStaff.name });
    }

    res.json({ message: `Đã chuyển hội thoại cho ${targetStaff.name}.`, assigned_to: staff_id });
  } catch (error) {
    console.error('[API] Lỗi transfer:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/messages/:customerId
 * Trả lịch sử chat CỦA SHOP (inbox + comments).
 */
router.get('/messages/:customerId', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { customerId } = req.params;

    const messages = await db.all(
      `SELECT id, shop_id, customer_id, sender, sender_type, text, intent, type, comment_id, post_id, is_hidden, is_internal, timestamp
       FROM Messages WHERE customer_id = ? AND shop_id = ? ORDER BY timestamp ASC`,
      [customerId, shopId]
    );

    res.json(messages);
  } catch (error) {
    console.error('[API] Lỗi lấy lịch sử chat:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/messages/internal — Ghi chú nội bộ (KHÔNG gửi cho khách)
 */
router.post('/messages/internal', async (req, res) => {
  try {
    const { customer_id, text } = req.body;
    if (!customer_id || !text) return res.status(400).json({ error: 'customer_id và text là bắt buộc.' });

    const db = getDB();
    const shopId = req.shop.shopId;
    const staffName = req.shop.email || 'Staff';

    // FIX: Kiểm tra customer thuộc đúng shop trước khi ghi
    const customerCheck = await db.get(
      'SELECT id FROM Customers WHERE id = ? AND shop_id = ?',
      [customer_id, shopId]
    );
    if (!customerCheck) return res.status(404).json({ error: 'Khách hàng không tồn tại.' });

    const result = await db.run(
      'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, type, is_internal) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [shopId, customer_id, 'bot', 'staff', text, 'inbox', 1]
    );

    const { getIO } = require('../../infra/socket/socketManager');
    const io = getIO();
    const msgData = {
      id: result.lastID, shop_id: shopId, customer_id: parseInt(customer_id),
      sender: 'bot', text, type: 'inbox', is_internal: 1,
      timestamp: new Date().toISOString(),
    };
    if (io) io.to(String(shopId)).emit('new_message', msgData);

    console.log(`[INTERNAL NOTE] Staff "${staffName}" → Khách #${customer_id}: "${text.substring(0, 50)}..."`);

    res.status(201).json(msgData);
  } catch (error) {
    console.error('[API] Lỗi ghi chú nội bộ:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/comments/:commentId/reply — Reply công khai vào comment
 */
router.post('/comments/:commentId/reply', async (req, res) => {
  try {
    const { text, customer_id } = req.body;
    if (!text) return res.status(400).json({ error: 'text là bắt buộc.' });

    const db = getDB();
    const shopId = req.shop.shopId;
    
    // FIX: Verify customer thuộc shop trước khi thực hiện hành động
    const customer = await db.get(
      'SELECT page_id FROM Customers WHERE id = ? AND shop_id = ?',
      [customer_id, shopId]
    );
    if (!customer?.page_id) return res.status(400).json({ error: 'Không tìm thấy kênh của khách.' });

    const integration = await db.get('SELECT access_token FROM ShopIntegrations WHERE page_id = ? AND shop_id = ?', [customer.page_id, shopId]);
    if (!integration?.access_token) return res.status(400).json({ error: 'Shop chưa kết nối Fanpage này.' });

    const { replyToComment } = require('../controllers/facebook.controller');
    await replyToComment(req.params.commentId, text, integration.access_token);

    const result = await db.run(
      'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, type, comment_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [shopId, customer_id, 'bot', 'staff', text, 'comment', req.params.commentId]
    );

    const { getIO } = require('../../infra/socket/socketManager');
    const io = getIO();
    const msgData = { id: result.lastID, shop_id: shopId, customer_id, sender: 'bot', text, type: 'comment', comment_id: req.params.commentId, timestamp: new Date().toISOString() };
    if (io) io.to(String(shopId)).emit('new_message', msgData);

    res.json(msgData);
  } catch (error) {
    console.error('[API] Lỗi reply comment:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/comments/:commentId/private — Nhắn riêng cho người comment
 */
router.post('/comments/:commentId/private', async (req, res) => {
  try {
    const { text, customer_id } = req.body;
    if (!text) return res.status(400).json({ error: 'text là bắt buộc.' });

    const db = getDB();
    const shopId = req.shop.shopId;
    
    // FIX: Verify customer thuộc shop trước khi thực hiện hành động
    const customer = await db.get(
      'SELECT page_id FROM Customers WHERE id = ? AND shop_id = ?',
      [customer_id, shopId]
    );
    if (!customer?.page_id) return res.status(400).json({ error: 'Không tìm thấy kênh của khách.' });

    const integration = await db.get('SELECT access_token FROM ShopIntegrations WHERE page_id = ? AND shop_id = ?', [customer.page_id, shopId]);
    if (!integration?.access_token) return res.status(400).json({ error: 'Shop chưa kết nối Fanpage này.' });

    const { sendPrivateReply } = require('../controllers/facebook.controller');
    await sendPrivateReply(req.params.commentId, text, integration.access_token);

    const result = await db.run(
      'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, type) VALUES (?, ?, ?, ?, ?, ?)',
      [shopId, customer_id, 'bot', 'staff', text, 'inbox']
    );

    const { getIO } = require('../../infra/socket/socketManager');
    const io = getIO();
    const msgData = { id: result.lastID, shop_id: shopId, customer_id, sender: 'bot', text, type: 'inbox', timestamp: new Date().toISOString() };
    if (io) io.to(String(shopId)).emit('new_message', msgData);

    res.json(msgData);
  } catch (error) {
    console.error('[API] Lỗi private reply:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/chat/send — Gửi tin nhắn qua Facebook Messenger (Send API)
 */
router.post('/chat/send', async (req, res) => {
  try {
    const { customerId, text } = req.body;
    if (!customerId || !text) return res.status(400).json({ error: 'customerId và text là bắt buộc.' });

    const db = getDB();
    const shopId = req.shop.shopId;

    // 1. Lấy thông tin khách hàng (psid và page_id)
    const customer = await db.get('SELECT platform_id, page_id FROM Customers WHERE id = ? AND shop_id = ?', [customerId, shopId]);
    if (!customer) return res.status(404).json({ error: 'Customer không tồn tại.' });

    const psid = customer.platform_id;
    const pageId = customer.page_id;

    // 2. Lấy Access Token từ ShopIntegrations
    const integration = await db.get(
      'SELECT access_token FROM ShopIntegrations WHERE shop_id = ? AND page_id = ? AND status = "connected"',
      [shopId, pageId]
    );
    if (!integration?.access_token) return res.status(400).json({ error: 'Page chưa được kết nối hoặc Access Token không hợp lệ.' });

    // 3. Gọi Facebook Graph API (v21.0) để bắn tin
    const fbUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${integration.access_token}`;
    const fbPayload = {
      recipient: { id: psid },
      message: { text: text },
      messaging_type: "RESPONSE"
    };

    const fbRes = await fetch(fbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fbPayload)
    });
    
    const fbData = await fbRes.json();

    if (!fbRes.ok || fbData.error) {
      console.error(`[SEND API] FB Error cho psid ${psid}:`, fbData.error);
      return res.status(400).json({ error: fbData.error?.message || 'Lỗi gửi tin Facebook' });
    }

    // 4. Lưu vào Database — KHÔNG truyền timestamp thủ công, để SQLite dùng CURRENT_TIMESTAMP mặc định
    const result = await db.run(
      'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, type) VALUES (?, ?, ?, ?, ?, ?)',
      [shopId, customerId, 'bot', 'staff', text, 'inbox']
    );

    // Lấy timestamp thật từ DB để đảm bảo frontend hiển thị đúng
    const savedMsg = await db.get('SELECT timestamp FROM Messages WHERE id = ?', [result.lastID]);

    // 5. Đồng bộ Real-time xuống Frontend
    const { getIO } = require('../../infra/socket/socketManager');
    const io = getIO();
    const msgData = {
      id: result.lastID,
      shop_id: shopId,
      customer_id: parseInt(customerId),
      sender: 'bot',
      sender_type: 'staff',
      text,
      type: 'inbox',
      timestamp: savedMsg?.timestamp || new Date().toISOString(),
    };
    
    // Phát vào Room riêng của shop
    if (io) io.to(String(shopId)).emit('new_message', msgData);

    console.log(`[CHAT] Đã gửi tin nhắn tới Khách #${customerId}: "${text.substring(0, 30)}..."`);
    res.status(200).json(msgData);

  } catch (error) {
    console.error('[API] Lỗi Send API:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/comments/:commentId/visibility — Ẩn/Hiện Comment thủ công
 */
router.post('/comments/:commentId/visibility', async (req, res) => {
  try {
    const { is_hidden, customer_id } = req.body;
    if (is_hidden === undefined) return res.status(400).json({ error: 'is_hidden là bắt buộc.' });

    const db = getDB();
    const shopId = req.shop.shopId;

    // FIX: Verify customer thuộc shop trước khi thực hiện hành động
    const customer = await db.get(
      'SELECT page_id FROM Customers WHERE id = ? AND shop_id = ?',
      [customer_id, shopId]
    );
    if (!customer?.page_id) return res.status(400).json({ error: 'Không tìm thấy kênh.' });

    const integration = await db.get('SELECT access_token FROM ShopIntegrations WHERE page_id = ? AND shop_id = ?', [customer.page_id, shopId]);
    if (!integration?.access_token) return res.status(400).json({ error: 'Shop chưa kết nối.' });

    const { toggleCommentVisibility } = require('../controllers/facebook.controller');
    const success = await toggleCommentVisibility(req.params.commentId, is_hidden, integration.access_token);
    
    if (success) {
      await db.run('UPDATE Messages SET is_hidden = ? WHERE comment_id = ? AND shop_id = ?', [is_hidden ? 1 : 0, req.params.commentId, shopId]);
      res.json({ success: true, is_hidden });
    } else {
      res.status(500).json({ error: 'Graph API từ chối yêu cầu.' });
    }
  } catch (error) {
    console.error('[API] Lỗi toggle visibility:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/facebook/post/:postId — Lấy nội dung Post qua Graph API
 */
router.get('/facebook/post/:postId', async (req, res) => {
  try {
    const { page_id } = req.query;
    if (!page_id) return res.status(400).json({ error: 'Yêu cầu page_id' });

    const db = getDB();
    const integration = await db.get('SELECT access_token FROM ShopIntegrations WHERE page_id = ? AND shop_id = ?', [page_id, req.shop.shopId]);
    if (!integration?.access_token) return res.status(400).json({ error: 'Shop chưa kết nối Fanpage này.' });

    const url = `https://graph.facebook.com/v21.0/${req.params.postId}?fields=message,full_picture,created_time,permalink_url&access_token=${integration.access_token}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    res.json(data);
  } catch (error) {
    console.error('[API] Lỗi lấy bài post:', error.message);
    res.status(500).json({ error: 'Lỗi lấy bài post' });
  }
});

/**
 * PATCH /api/shop/settings — Cập nhật cấu hình chung của Shop (admin/owner only)
 */
router.patch('/shop/settings', async (req, res) => {
  try {
    const { auto_assign_staff } = req.body;
    const db = getDB();
    const shopId = req.shop.shopId;
    const userRole = req.shop.role;

    if (userRole === 'staff') {
      return res.status(403).json({ error: 'Bạn không có quyền sửa cấu hình hệ thống.' });
    }

    if (auto_assign_staff !== undefined) {
      await db.run('UPDATE Shops SET auto_assign_staff = ? WHERE id = ?', [auto_assign_staff ? 1 : 0, shopId]);
    }

    res.json({ success: true, message: 'Đã cập nhật cấu hình.' });
  } catch (error) {
    console.error('[API] Lỗi cập nhật config:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;

