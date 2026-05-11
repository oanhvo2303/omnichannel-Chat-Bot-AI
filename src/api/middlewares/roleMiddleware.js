'use strict';

const { getDB } = require('../../infra/database/sqliteConnection');

// =============================================
// Role hierarchy (cao → thấp)
// owner > admin > staff.order/staff.marketing/staff.chat > staff
// =============================================
const OWNER_ROLES  = new Set(['owner', 'shop_owner', 'super_admin']);
const ADMIN_ROLES  = new Set(['owner', 'admin', 'shop_owner', 'super_admin']);
// Roles được phép quản lý đơn hàng / sản phẩm
const ORDER_ROLES  = new Set(['owner', 'admin', 'shop_owner', 'super_admin', 'staff.order']);
// Roles được phép broadcast / remarketing
const MARKETING_ROLES = new Set(['owner', 'admin', 'shop_owner', 'super_admin', 'staff.marketing']);
// Tất cả staff đều được chat (fallback cuối)
const CHAT_ROLES   = new Set(['owner', 'admin', 'shop_owner', 'super_admin', 'staff', 'staff.chat', 'staff.order', 'staff.marketing']);

function normalizeRole(role) {
  return (role || '').toLowerCase();
}

/**
 * Chỉ cho phép Owner và Admin
 * Dùng cho: cấu hình bot, AI, FAQ, tracking, phiên shipping, users, pages
 */
const requireOwnerOrAdmin = (req, res, next) => {
  const role = normalizeRole(req.shop?.role);
  if (!ADMIN_ROLES.has(role)) {
    return res.status(403).json({
      error: 'Forbidden: Chức năng này chỉ dành cho Admin / Chủ shop.',
    });
  }
  next();
};

/**
 * Cho phép tạo/sửa/xóa đơn hàng và sản phẩm
 * Dùng cho: orders, products, stock
 */
const requireOrderPermission = (req, res, next) => {
  const role = normalizeRole(req.shop?.role);
  if (!ORDER_ROLES.has(role)) {
    return res.status(403).json({
      error: 'Forbidden: Bạn không có quyền quản lý đơn hàng.',
    });
  }
  next();
};

/**
 * Cho phép broadcast / remarketing
 * Dùng cho: broadcast, remarketing campaigns
 */
const requireMarketingPermission = (req, res, next) => {
  const role = normalizeRole(req.shop?.role);
  if (!MARKETING_ROLES.has(role)) {
    return res.status(403).json({
      error: 'Forbidden: Bạn không có quyền gửi tin marketing.',
    });
  }
  next();
};

/**
 * Staff DB Re-Verification Middleware
 * Kiểm tra lại DB để đảm bảo staff chưa bị xóa / bị thay đổi quyền sau khi JWT được cấp
 */
const verifyStaffCurrent = async (req, res, next) => {
  const { staffId, shopId } = req.shop || {};
  if (!staffId) return next();

  try {
    const db = getDB();
    const staff = await db.get(
      'SELECT id, role, is_active FROM Staff WHERE id = ? AND shop_id = ?',
      [staffId, shopId]
    );

    if (!staff) {
      console.warn(`[RBAC] Staff #${staffId} không còn tồn tại trong Shop #${shopId}`);
      return res.status(401).json({ error: 'Unauthorized: Tài khoản nhân viên không còn tồn tại.' });
    }

    if (staff.is_active === 0) {
      console.warn(`[RBAC] Staff #${staffId} bị khóa — từ chối request`);
      return res.status(403).json({ error: 'Forbidden: Tài khoản đã bị vô hiệu hóa.' });
    }

    // Ghi đè role từ DB (tránh stale JWT)
    req.shop.role = staff.role;
    next();
  } catch (err) {
    console.error('[RBAC] verifyStaffCurrent error:', err.message);
    next();
  }
};

module.exports = {
  requireOwnerOrAdmin,
  requireOrderPermission,
  requireMarketingPermission,
  verifyStaffCurrent,
  ADMIN_ROLES,
  ORDER_ROLES,
  MARKETING_ROLES,
  CHAT_ROLES,
};
