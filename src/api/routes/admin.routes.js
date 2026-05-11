'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware, verifySuperAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Bọc 2 lớp khiên: Phải đăng nhập + Phải có mác SUPER_ADMIN
router.use(authMiddleware);
router.use(verifySuperAdmin);

// ═══════════════════════════════════════════
// PLAN QUOTA MAP
// ═══════════════════════════════════════════
const PLAN_QUOTA = { FREE: 500, BASIC: 500, PRO: 2000, ENTERPRISE: 10000 };

/**
 * GET /api/admin/tenants
 * Danh sách toàn bộ các Shop + License info
 */
router.get('/tenants', async (req, res) => {
  try {
    const db = getDB();
    const query = `
      SELECT 
        s.id, s.email, s.shop_name, s.role, s.account_status,
        s.subscription_plan, s.license_status, s.license_expires_at,
        s.ai_quota_limit, s.ai_messages_used, s.created_at,
        (SELECT COUNT(id) FROM Messages m WHERE m.shop_id = s.id) AS total_messages,
        (SELECT COUNT(id) FROM Orders o WHERE o.shop_id = s.id) AS total_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM Orders o WHERE o.shop_id = s.id AND o.status != 'cancelled') AS total_revenue,
        (SELECT COUNT(id) FROM Customers c WHERE c.shop_id = s.id) AS total_customers,
        (SELECT COUNT(id) FROM Pages p WHERE p.shop_id = s.id) AS total_pages
      FROM Shops s
      ORDER BY s.created_at DESC
    `;
    const shops = await db.all(query);
    res.json(shops);
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi lấy danh sách Tenant:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/admin/metrics
 * Dashboard tổng quan SaaS
 */
router.get('/metrics', async (req, res) => {
  try {
    const db = getDB();
    const todayStr = new Date().toISOString().split('T')[0];

    const totalTenants = await db.get("SELECT COUNT(id) as count FROM Shops");
    const activeTenants = await db.get("SELECT COUNT(id) as count FROM Shops WHERE license_status = 'ACTIVE'");
    const suspendedTenants = await db.get("SELECT COUNT(id) as count FROM Shops WHERE license_status = 'SUSPENDED'");
    const expiredTenants = await db.get("SELECT COUNT(id) as count FROM Shops WHERE license_status = 'EXPIRED'");
    const trialTenants = await db.get("SELECT COUNT(id) as count FROM Shops WHERE license_status = 'TRIAL'");
    const newToday = await db.get(`SELECT COUNT(id) as count FROM Shops WHERE DATE(created_at) = ?`, [todayStr]);

    // MRR: PRO = 500k, ENTERPRISE = 2000k
    const proCount = await db.get("SELECT COUNT(id) as count FROM Shops WHERE UPPER(subscription_plan) = 'PRO' AND license_status = 'ACTIVE'");
    const entCount = await db.get("SELECT COUNT(id) as count FROM Shops WHERE UPPER(subscription_plan) = 'ENTERPRISE' AND license_status = 'ACTIVE'");
    const mrr = (proCount.count * 500000) + (entCount.count * 2000000);

    // Tổng AI messages toàn hệ thống
    const totalAI = await db.get("SELECT COALESCE(SUM(ai_messages_used), 0) as total FROM Shops");
    // Tổng doanh thu tất cả shop
    const totalRevenue = await db.get("SELECT COALESCE(SUM(total_amount), 0) as total FROM Orders WHERE status != 'cancelled'");
    // Tổng đơn hàng
    const totalOrders = await db.get("SELECT COUNT(id) as count FROM Orders");

    res.json({
      totalTenants: totalTenants.count,
      activeTenants: activeTenants.count,
      suspendedTenants: suspendedTenants.count,
      expiredTenants: expiredTenants.count,
      trialTenants: trialTenants.count,
      newTenantsToday: newToday.count,
      mrr,
      totalAIMessages: totalAI.total,
      totalRevenue: totalRevenue.total,
      totalOrders: totalOrders.count,
    });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi lấy Metrics:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /api/admin/tenants/:id/plan
 * Đổi gói cước + auto-set AI quota
 */
router.put('/tenants/:id/plan', async (req, res) => {
  try {
    const db = getDB();
    const { plan } = req.body;
    const shopId = req.params.id;
    const upperPlan = (plan || '').toUpperCase();

    if (!['FREE', 'BASIC', 'PRO', 'ENTERPRISE'].includes(upperPlan)) {
      return res.status(400).json({ error: 'Plan không hợp lệ. Chỉ nhận FREE/BASIC/PRO/ENTERPRISE.' });
    }

    const shop = await db.get('SELECT id FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại' });

    const newQuota = PLAN_QUOTA[upperPlan] || 500;
    await db.run('UPDATE Shops SET subscription_plan = ?, ai_quota_limit = ? WHERE id = ?', [upperPlan, newQuota, shopId]);

    console.log(`[SUPER_ADMIN] Shop #${shopId} → Plan: ${upperPlan}, Quota: ${newQuota}`);
    res.json({ success: true, message: `Chuyển sang gói ${upperPlan}. AI quota: ${newQuota} msg/tháng.` });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi đổi plan:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /api/admin/tenants/:id/suspend
 * Khóa tài khoản Shop
 */
router.put('/tenants/:id/suspend', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.params.id;

    if (String(shopId) === String(req.shop.shopId)) {
      return res.status(400).json({ error: 'Không thể tự khóa tài khoản của chính mình.' });
    }

    const shop = await db.get('SELECT id, role FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại' });
    if (shop.role === 'SUPER_ADMIN') return res.status(400).json({ error: 'Không thể khóa Super Admin.' });

    await db.run("UPDATE Shops SET license_status = 'SUSPENDED', account_status = 'banned' WHERE id = ?", [shopId]);

    console.log(`[SUPER_ADMIN] 🚫 Shop #${shopId} đã bị KHÓA bởi Admin #${req.shop.shopId}`);
    res.json({ success: true, message: `Shop #${shopId} đã bị khóa.` });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi suspend:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /api/admin/tenants/:id/activate
 * Mở khóa tài khoản Shop
 */
router.put('/tenants/:id/activate', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.params.id;

    const shop = await db.get('SELECT id FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại' });

    await db.run("UPDATE Shops SET license_status = 'ACTIVE', account_status = 'active' WHERE id = ?", [shopId]);

    console.log(`[SUPER_ADMIN] ✅ Shop #${shopId} đã được MỞ KHÓA bởi Admin #${req.shop.shopId}`);
    res.json({ success: true, message: `Shop #${shopId} đã được kích hoạt.` });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi activate:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /api/admin/tenants/:id/extend
 * Gia hạn license (cộng thêm ngày)
 */
router.put('/tenants/:id/extend', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.params.id;
    const { days } = req.body; // 30 hoặc 365

    if (!days || ![30, 90, 180, 365].includes(Number(days))) {
      return res.status(400).json({ error: 'Số ngày không hợp lệ. Chỉ nhận 30/90/180/365.' });
    }

    const shop = await db.get('SELECT id, license_expires_at FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại' });

    // Tính ngày hết hạn mới: từ ngày hiện tại (hoặc ngày hết hạn cũ nếu còn valid)
    const baseDate = shop.license_expires_at && new Date(shop.license_expires_at) > new Date()
      ? new Date(shop.license_expires_at)
      : new Date();
    baseDate.setDate(baseDate.getDate() + Number(days));

    await db.run(
      "UPDATE Shops SET license_expires_at = ?, license_status = 'ACTIVE', account_status = 'active' WHERE id = ?",
      [baseDate.toISOString(), shopId]
    );

    console.log(`[SUPER_ADMIN] 📅 Shop #${shopId} gia hạn +${days} ngày → ${baseDate.toLocaleDateString('vi-VN')}`);
    res.json({
      success: true,
      message: `Gia hạn +${days} ngày thành công. Hạn mới: ${baseDate.toLocaleDateString('vi-VN')}.`,
      new_expires_at: baseDate.toISOString(),
    });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi gia hạn:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /api/admin/tenants/:id/quota
 * Thay đổi AI quota limit
 */
router.put('/tenants/:id/quota', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.params.id;
    const { quota } = req.body;

    if (!quota || quota < 0 || quota > 100000) {
      return res.status(400).json({ error: 'Quota không hợp lệ (0-100000).' });
    }

    const shop = await db.get('SELECT id FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại' });

    await db.run('UPDATE Shops SET ai_quota_limit = ? WHERE id = ?', [Number(quota), shopId]);

    console.log(`[SUPER_ADMIN] 🤖 Shop #${shopId} AI quota → ${quota}`);
    res.json({ success: true, message: `AI quota đã được cập nhật thành ${quota} tin nhắn/tháng.` });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi quota:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /api/admin/tenants/:id/status (Legacy compat)
 */
router.put('/tenants/:id/status', async (req, res) => {
  try {
    const db = getDB();
    const { status } = req.body;
    const shopId = req.params.id;

    if (!['active', 'banned', 'trial'].includes(status)) {
      return res.status(400).json({ error: 'Status không hợp lệ.' });
    }

    if (String(shopId) === String(req.shop.shopId)) {
      return res.status(400).json({ error: 'Không thể tự thay đổi quyền hạn của chính mình.' });
    }

    const shop = await db.get('SELECT id FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại' });

    // Sync license_status
    const licenseMap = { active: 'ACTIVE', banned: 'SUSPENDED', trial: 'TRIAL' };
    await db.run('UPDATE Shops SET account_status = ?, license_status = ? WHERE id = ?',
      [status, licenseMap[status], shopId]);

    res.json({ success: true, message: `Đã cập nhật status → ${status}` });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/admin/reset-ai-quotas
 * Reset AI quota hàng tháng (có thể gọi bằng cron)
 */
router.post('/reset-ai-quotas', async (req, res) => {
  try {
    const db = getDB();
    await db.run('UPDATE Shops SET ai_messages_used = 0');
    console.log('[SUPER_ADMIN] 🔄 Reset toàn bộ AI quota usage');
    res.json({ success: true, message: 'Đã reset AI quota usage cho toàn bộ shop.' });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi reset quota:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PATCH /api/admin/tenants/:id/profile
 * Admin sửa thông tin shop_name + email của user
 */
router.patch('/tenants/:id/profile', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.params.id;
    const { shop_name, email } = req.body;

    if (!shop_name && !email) {
      return res.status(400).json({ error: 'Cần ít nhất shop_name hoặc email.' });
    }

    const shop = await db.get('SELECT id FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại.' });

    if (email) {
      const conflict = await db.get('SELECT id FROM Shops WHERE email = ? AND id != ?', [email.trim().toLowerCase(), shopId]);
      if (conflict) return res.status(409).json({ error: 'Email đã được sử dụng bởi tài khoản khác.' });
    }

    const updates = [];
    const params = [];
    if (shop_name) { updates.push('shop_name = ?'); params.push(shop_name.trim()); }
    if (email) { updates.push('email = ?'); params.push(email.trim().toLowerCase()); }
    params.push(shopId);

    await db.run(`UPDATE Shops SET ${updates.join(', ')} WHERE id = ?`, params);
    console.log(`[SUPER_ADMIN] ✏️ Admin #${req.shop.shopId} sửa profile Shop #${shopId}: ${updates.join(', ')}`);

    const updated = await db.get('SELECT id, email, shop_name, role, account_status, subscription_plan, license_status FROM Shops WHERE id = ?', [shopId]);
    res.json({ success: true, message: 'Đã cập nhật thông tin.', shop: updated });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi sửa profile:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PATCH /api/admin/tenants/:id/reset-password
 * Admin đặt lại mật khẩu cho user (không cần mật khẩu cũ)
 */
router.patch('/tenants/:id/reset-password', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.params.id;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    const shop = await db.get('SELECT id, role FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại.' });
    if (shop.role === 'SUPER_ADMIN' && String(shopId) !== String(req.shop.shopId)) {
      return res.status(403).json({ error: 'Không thể đặt lại mật khẩu cho Super Admin khác.' });
    }

    const salt = await require('bcryptjs').genSalt(10);
    const hash = await require('bcryptjs').hash(new_password, salt);
    await db.run('UPDATE Shops SET password_hash = ? WHERE id = ?', [hash, shopId]);

    console.log(`[SUPER_ADMIN] 🔑 Admin #${req.shop.shopId} đã reset password Shop #${shopId}`);
    res.json({ success: true, message: `Đã đặt lại mật khẩu cho Shop #${shopId}.` });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi reset password:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/admin/tenants/:id/reset-quota
 * Admin reset bộ đếm AI cho 1 shop cụ thể (đầu kỳ billing)
 */
router.post('/tenants/:id/reset-quota', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.params.id;
    const shop = await db.get('SELECT id FROM Shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop không tồn tại.' });

    await db.run('UPDATE Shops SET ai_messages_used = 0 WHERE id = ?', [shopId]);
    console.log(`[SUPER_ADMIN] 🔄 Admin #${req.shop.shopId} reset AI quota counter Shop #${shopId}`);
    res.json({ success: true, message: `Đã reset AI quota usage cho Shop #${shopId}.` });
  } catch (error) {
    console.error('[SUPER_ADMIN] Lỗi reset quota shop:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
