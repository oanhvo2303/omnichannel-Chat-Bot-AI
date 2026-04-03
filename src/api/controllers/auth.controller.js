'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { getDB } = require('../../infra/database/sqliteConnection');

/**
 * Auth Controller — Đăng ký, Đăng nhập, Lấy thông tin Shop
 */

// ---- POST /api/auth/register ----
const register = async (req, res) => {
  try {
    const { email, password, shop_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc.' });
    }

    const db = getDB();

    // Check email đã tồn tại?
    const existing = await db.get('SELECT id FROM Shops WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Email này đã được đăng ký.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert shop mới
    const result = await db.run(
      'INSERT INTO Shops (email, password_hash, shop_name) VALUES (?, ?, ?)',
      [email, password_hash, shop_name || 'My Shop']
    );

    // Tạo JWT
    const token = jwt.sign(
      { shopId: result.lastID, email, role: 'SHOP_OWNER' },
      config.jwt.secret,
      { expiresIn: '7d' } // Hạn 7 ngày theo yêu cầu sếp
    );

    console.log(`[AUTH] Shop mới đăng ký: ${email} (ID: ${result.lastID})`);

    res.status(201).json({
      message: 'Đăng ký thành công!',
      token,
      shop: { id: result.lastID, email, shop_name: shop_name || 'My Shop', role: 'SHOP_OWNER', is_active: 0, subscription_plan: 'FREE' },
    });
  } catch (error) {
    console.error('[AUTH] Lỗi đăng ký:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ---- POST /api/auth/login ----
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc.' });
    }

    const db = getDB();

    const shop = await db.get('SELECT * FROM Shops WHERE email = ?', [email]);
    if (!shop) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
    }

    // So sánh password
    const isMatch = await bcrypt.compare(password, shop.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
    }

    // Kiểm tra tính kích hoạt (tuỳ chọn chặn nếu is_active = 0, nhưng tạm để pass cho dev)
    if (shop.is_active === 0) {
      console.log(`[AUTH] Shop ${email} đang chờ duyệt (is_active=0).`);
    }

    // Tạo JWT (hạn 7 ngày như Sếp yêu cầu)
    const token = jwt.sign(
      { shopId: shop.id, email: shop.email, role: shop.role || 'SHOP_OWNER' },
      config.jwt.secret,
      { expiresIn: '7d' }
    );

    console.log(`[AUTH] Shop đăng nhập: ${email} (ID: ${shop.id}, Role: ${shop.role})`);

    res.json({
      message: 'Đăng nhập thành công!',
      token,
      shop: {
        id: shop.id,
        email: shop.email,
        shop_name: shop.shop_name,
        role: shop.role || 'SHOP_OWNER',
        is_active: shop.is_active,
        subscription_plan: shop.subscription_plan,
        license_status: shop.license_status || 'ACTIVE',
        account_status: shop.account_status,
        facebook_page_id: shop.facebook_page_id,
      },
    });
  } catch (error) {
    console.error('[AUTH] Lỗi đăng nhập:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ---- GET /api/auth/me ----
const me = async (req, res) => {
  try {
    const db = getDB();
    const shop = await db.get(
      'SELECT id, email, shop_name, role, facebook_page_id, subscription_plan, license_status, license_expires_at, ai_quota_limit, ai_messages_used, created_at FROM Shops WHERE id = ?',
      [req.shop.shopId]
    );

    if (!shop) {
      return res.status(404).json({ error: 'Shop không tồn tại.' });
    }

    res.json({ shop });
  } catch (error) {
    console.error('[AUTH] Lỗi lấy thông tin:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { register, login, me };
