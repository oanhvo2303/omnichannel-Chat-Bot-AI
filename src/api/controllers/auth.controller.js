'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { getDB } = require('../../infra/database/sqliteConnection');

/**
 * Auth Controller — đăng ký, đăng nhập, profile, đổi mật khẩu
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

    // Chặn login nếu account bị banned
    if (shop.account_status === 'banned') {
      console.warn(`[AUTH] ❌ Tài khoản bị khóa: ${email}`);
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ hỗ trợ.' });
    }

    // Chặn login nếu chưa được duyệt (is_active = 0)
    // Ghi chú: Nếu muốn cho phép dev/test không check, đặt DEV_SKIP_ACTIVE_CHECK=true trong .env
    if (shop.is_active === 0 && process.env.DEV_SKIP_ACTIVE_CHECK !== 'true') {
      console.warn(`[AUTH] ❌ Tài khoản chờ duyệt: ${email} (is_active=0)`);
      return res.status(403).json({ error: 'Tài khoản đang chờ duyệt. Vui lòng liên hệ quản trị để kích hoạt.' });
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

// ---- PATCH /api/auth/profile ----
// User tự cập nhật thông tin cơ bản (shop_name, email)
const updateProfile = async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { shop_name, email } = req.body;

    if (!shop_name && !email) {
      return res.status(400).json({ error: 'Cần cung cấp ít nhất shop_name hoặc email.' });
    }

    // Validate email không trùng với account khác
    if (email) {
      const emailTrimmed = email.trim().toLowerCase();
      const existing = await db.get('SELECT id FROM Shops WHERE email = ? AND id != ?', [emailTrimmed, shopId]);
      if (existing) return res.status(409).json({ error: 'Email này đã được sử dụng bởi tài khoản khác.' });
    }

    const updates = [];
    const params = [];
    if (shop_name) { updates.push('shop_name = ?'); params.push(shop_name.trim()); }
    if (email) { updates.push('email = ?'); params.push(email.trim().toLowerCase()); }
    params.push(shopId);

    await db.run(`UPDATE Shops SET ${updates.join(', ')} WHERE id = ?`, params);
    console.log(`[AUTH] Shop #${shopId} cập nhật profile: ${updates.join(', ')}`);

    const updated = await db.get(
      'SELECT id, email, shop_name, role, subscription_plan, license_status FROM Shops WHERE id = ?',
      [shopId]
    );
    res.json({ success: true, message: 'Đã cập nhật thông tin.', shop: updated });
  } catch (error) {
    console.error('[AUTH] Lỗi updateProfile:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ---- PATCH /api/auth/password ----
// User tự đổi mật khẩu (yêu cầu mật khẩu cũ)
const changePassword = async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password) {
      return res.status(400).json({ error: 'Cần cung cấp mật khẩu cũ và mật khẩu mới.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }
    if (old_password === new_password) {
      return res.status(400).json({ error: 'Mật khẩu mới không được trùng mật khẩu cũ.' });
    }

    const shop = await db.get('SELECT password_hash FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Tài khoản không tồn tại.' });

    const isMatch = await bcrypt.compare(old_password, shop.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Mật khẩu cũ không đúng.' });

    const salt = await bcrypt.genSalt(10);
    const new_hash = await bcrypt.hash(new_password, salt);
    await db.run('UPDATE Shops SET password_hash = ? WHERE id = ?', [new_hash, shopId]);
    console.log(`[AUTH] Shop #${shopId} đã đổi mật khẩu thành công.`);

    res.json({ success: true, message: 'Đã đổi mật khẩu thành công. Vui lòng đăng nhập lại.' });
  } catch (error) {
    console.error('[AUTH] Lỗi changePassword:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { register, login, me, updateProfile, changePassword };
