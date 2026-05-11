'use strict';

const jwt = require('jsonwebtoken');
const config = require('../../config');
const { getDB } = require('../../infra/database/sqliteConnection');

/**
 * JWT Authentication Middleware (SaaS License Enforcement)
 *
 * Supports both Shop Owner and Staff JWT tokens.
 * Enforces license_status checks: SUSPENDED/EXPIRED → 403
 * SUPER_ADMIN bypasses all license checks.
 */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Thiếu token xác thực.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const db = getDB();

    // Fetch shop with license info
    const shopEntry = await db.get(
      'SELECT role, account_status, license_status, license_expires_at, ai_quota_limit, ai_messages_used FROM Shops WHERE id = ?',
      [decoded.shopId]
    );
    if (!shopEntry) {
      return res.status(401).json({ error: 'Unauthorized: Shop không tồn tại.' });
    }

    // ════════════════════════════════════════════
    // LICENSE ENFORCEMENT (SUPER_ADMIN bypass)
    // ════════════════════════════════════════════
    const isSuperAdmin = shopEntry.role === 'SUPER_ADMIN';

    if (!isSuperAdmin) {
      // Auto-expire TRIAL if past due date
      if (shopEntry.license_status === 'TRIAL' && shopEntry.license_expires_at) {
        const expiresAt = new Date(shopEntry.license_expires_at);
        if (expiresAt < new Date()) {
          await db.run("UPDATE Shops SET license_status = 'EXPIRED', account_status = 'banned' WHERE id = ?", [decoded.shopId]);
          shopEntry.license_status = 'EXPIRED';
        }
      }

      // Auto-expire ACTIVE if license_expires_at is set and past
      if (shopEntry.license_status === 'ACTIVE' && shopEntry.license_expires_at) {
        const expiresAt = new Date(shopEntry.license_expires_at);
        if (expiresAt < new Date()) {
          await db.run("UPDATE Shops SET license_status = 'EXPIRED' WHERE id = ?", [decoded.shopId]);
          shopEntry.license_status = 'EXPIRED';
        }
      }

      // Block SUSPENDED accounts
      if (shopEntry.license_status === 'SUSPENDED') {
        return res.status(403).json({
          error: 'Tài khoản đã bị khóa bởi Quản trị hệ thống. Vui lòng liên hệ Admin.',
          license_status: 'SUSPENDED',
          suspended: true,
        });
      }

      // Block EXPIRED accounts
      if (shopEntry.license_status === 'EXPIRED') {
        return res.status(403).json({
          error: 'License đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.',
          license_status: 'EXPIRED',
          license_expired: true,
        });
      }
    }

    // Gán thông tin vào req.shop
    req.shop = {
      shopId: decoded.shopId,
      email: decoded.email,
      staffId: decoded.staffId || null,
      role: decoded.staffId ? decoded.role : (shopEntry.role || 'SHOP_OWNER'),
      account_status: shopEntry.account_status,
      license_status: shopEntry.license_status || 'ACTIVE',
      ai_quota_limit: shopEntry.ai_quota_limit || 1000,
      ai_messages_used: shopEntry.ai_messages_used || 0,
    };

    // FIX RBAC: Nếu là Staff token, xác minh lại từ DB để bắt giảm quyền / bị xóa
    if (decoded.staffId) {
      const staffEntry = await db.get(
        'SELECT id, role FROM Staff WHERE id = ? AND shop_id = ?',
        [decoded.staffId, decoded.shopId]
      );
      if (!staffEntry) {
        console.warn(`[AUTH] Staff #${decoded.staffId} không tồn tại trong Shop #${decoded.shopId} — từ chối token.`);
        return res.status(401).json({ error: 'Unauthorized: Tài khoản nhân viên đã bị xóa. Vui lòng đăng nhập lại.' });
      }
      // Ghi đè role từ DB — bảo đảm JWT cũ không mang quyền cũ sau khi bị giáng
      req.shop.role = staffEntry.role;
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized: Token đã hết hạn.' });
    }
    return res.status(401).json({ error: 'Unauthorized: Token không hợp lệ.' });
  }
};

/**
 * Middleware đặc quyền dành riêng cho nền tảng (SaaS).
 * Phải được bọc SAU authMiddleware.
 */
const verifySuperAdmin = (req, res, next) => {
  if (!req.shop) {
    return res.status(401).json({ error: 'Unauthorized: Chưa xác thực.' });
  }
  if (req.shop.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Truy cập bị từ chối. Khu vực dành riêng cho Super Admin.' });
  }
  next();
};

module.exports = { authMiddleware, verifySuperAdmin };
