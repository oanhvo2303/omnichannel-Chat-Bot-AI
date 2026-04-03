'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { getDB } = require('../../infra/database/sqliteConnection');

/**
 * Staff Auth Controller — Đăng ký nhân viên, Đăng nhập, Quản lý staff
 */

// ---- POST /api/staff/register — Owner tạo nhân viên mới ----
const registerStaff = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc.' });

    const db = getDB();
    const shopId = req.shop.shopId;
    const userRole = req.shop.role;

    // Chỉ owner/admin mới được tạo staff
    if (userRole === 'staff') return res.status(403).json({ error: 'Bạn không có quyền tạo nhân viên.' });

    const existing = await db.get('SELECT id FROM Staff WHERE shop_id = ? AND email = ?', [shopId, email]);
    if (existing) return res.status(409).json({ error: 'Email nhân viên đã tồn tại.' });

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const staffRole = (role === 'admin' && userRole === 'owner') ? 'admin' : 'staff';

    const result = await db.run(
      'INSERT INTO Staff (shop_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
      [shopId, email, password_hash, name || email.split('@')[0], staffRole]
    );

    console.log(`[STAFF] Nhân viên mới: ${email} (${staffRole}) cho Shop #${shopId}`);

    res.status(201).json({
      message: 'Tạo nhân viên thành công!',
      staff: { id: result.lastID, email, name: name || email.split('@')[0], role: staffRole },
    });
  } catch (error) {
    console.error('[STAFF] Lỗi tạo nhân viên:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ---- POST /api/staff/login — Nhân viên đăng nhập ----
const loginStaff = async (req, res) => {
  try {
    const { email, password, shop_id } = req.body;
    if (!email || !password || !shop_id) {
      return res.status(400).json({ error: 'Email, mật khẩu và shop_id là bắt buộc.' });
    }

    const db = getDB();

    const staff = await db.get('SELECT * FROM Staff WHERE shop_id = ? AND email = ?', [shop_id, email]);
    if (!staff) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });

    const isMatch = await bcrypt.compare(password, staff.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });

    // Đánh dấu online
    await db.run('UPDATE Staff SET is_online = 1 WHERE id = ?', [staff.id]);

    const shop = await db.get('SELECT id, email, shop_name, facebook_page_id FROM Shops WHERE id = ?', [shop_id]);

    const token = jwt.sign(
      { shopId: shop_id, email: staff.email, staffId: staff.id, role: staff.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    console.log(`[STAFF] Đăng nhập: ${email} (${staff.role}) Shop #${shop_id}`);

    res.json({
      message: 'Đăng nhập thành công!',
      token,
      shop: { ...shop, staff_id: staff.id, staff_name: staff.name, role: staff.role },
    });
  } catch (error) {
    console.error('[STAFF] Lỗi đăng nhập:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ---- GET /api/staff — Lấy danh sách nhân viên ----
const listStaff = async (req, res) => {
  try {
    const db = getDB();
    const staff = await db.all(
      'SELECT id, email, name, role, is_online, created_at FROM Staff WHERE shop_id = ?',
      [req.shop.shopId]
    );
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ---- POST /api/staff/offline — Đánh dấu offline ----
const goOffline = async (req, res) => {
  try {
    const db = getDB();
    if (req.shop.staffId) {
      await db.run('UPDATE Staff SET is_online = 0 WHERE id = ?', [req.shop.staffId]);
    }
    res.json({ message: 'Đã offline.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { registerStaff, loginStaff, listStaff, goOffline };
