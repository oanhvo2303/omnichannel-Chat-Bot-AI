'use strict';

const { getDB } = require('../../infra/database/sqliteConnection');

/**
 * RBAC Middleware — Chặn Staff khỏi các API cấu hình quan trọng
 *
 * Dùng SAU authMiddleware.
 * Cho phép: owner, admin, SHOP_OWNER, SUPER_ADMIN
 * Chặn: staff (role === 'staff')
 */
const requireOwnerOrAdmin = (req, res, next) => {
  const role = (req.shop?.role || '').toLowerCase();
  // Danh sách role không được phép
  if (role === 'staff') {
    return res.status(403).json({
      error: 'Forbidden: Bạn không có quyền thực hiện thao tác này. Liên hệ Chủ shop hoặc Admin.',
    });
  }
  next();
};

/**
 * Staff DB Re-Verification Middleware
 *
 * Khi authMiddleware phát hiện token có staffId,
 * middleware này kiểm tra lại DB để đảm bảo:
 *   1. Staff vẫn còn tồn tại (chưa bị xóa)
 *   2. Role hiện tại từ DB (tránh dùng role cũ trong JWT sau khi bị giáng quyền)
 *
 * Phải được gọi SAU authMiddleware để req.shop đã được gán.
 */
const verifyStaffCurrent = async (req, res, next) => {
  const { staffId, shopId } = req.shop || {};
  if (!staffId) return next(); // Shop owner token — không cần check Staff table

  try {
    const db = getDB();
    const staff = await db.get(
      'SELECT id, role FROM Staff WHERE id = ? AND shop_id = ?',
      [staffId, shopId]
    );

    if (!staff) {
      console.warn(`[RBAC] Staff #${staffId} không còn tồn tại trong Shop #${shopId} — từ chối token.`);
      return res.status(401).json({ error: 'Unauthorized: Tài khoản nhân viên không còn tồn tại. Vui lòng đăng nhập lại.' });
    }

    // Ghi đè role từ DB (tránh role cũ trong JWT sau khi bị giáng quyền)
    req.shop.role = staff.role;
    next();
  } catch (err) {
    console.error('[RBAC] verifyStaffCurrent error:', err.message);
    next(); // Không block nếu lỗi DB — chấp nhận rủi ro nhỏ hơn block toàn hệ thống
  }
};

module.exports = { requireOwnerOrAdmin, verifyStaffCurrent };
