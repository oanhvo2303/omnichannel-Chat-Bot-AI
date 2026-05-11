'use strict';

/**
 * SaaS Plan Limits Service
 *
 * Định nghĩa giới hạn tài nguyên theo từng plan.
 * Dùng middleware checkPlanLimit() trước các route tạo mới resource.
 *
 * Plans:
 *  FREE       — 1 page, 2 staff, 500 customers, 3 broadcasts/tháng, 500 AI messages/ngày
 *  PRO        — 5 pages, 15 staff, 20,000 customers, 50 broadcasts/tháng, 2,000 AI messages/ngày
 *  ENTERPRISE — unlimited
 */

const { getDB } = require('../../infra/database/sqliteConnection');

// ─── Plan definitions ─────────────────────────────────────────
const PLAN_LIMITS = {
  FREE: {
    pages:           1,
    staff:           2,
    customers:       500,
    broadcasts_month: 3,
    ai_messages_day: 500,
    products:        50,
  },
  PRO: {
    pages:            5,
    staff:           15,
    customers:      20_000,
    broadcasts_month: 50,
    ai_messages_day: 2_000,
    products:        500,
  },
  ENTERPRISE: {
    pages:            Infinity,
    staff:            Infinity,
    customers:        Infinity,
    broadcasts_month: Infinity,
    ai_messages_day:  Infinity,
    products:         Infinity,
  },
};

function getLimits(plan) {
  return PLAN_LIMITS[(plan || 'FREE').toUpperCase()] || PLAN_LIMITS.FREE;
}

// ─── Count helpers ────────────────────────────────────────────

async function countPages(db, shopId) {
  const row = await db.get(
    // Bug 7 fix: platform lưu dạng 'facebook_<pageId>' hoặc 'facebook'
    `SELECT COUNT(*) AS cnt FROM ShopIntegrations
     WHERE shop_id = ? AND (platform = 'facebook' OR platform LIKE 'facebook_%') AND status = 'connected'`,
    [shopId]
  );
  return row?.cnt ?? 0;
}

async function countStaff(db, shopId) {
  const row = await db.get(
    `SELECT COUNT(*) AS cnt FROM Staff WHERE shop_id = ? AND is_active = 1`,
    [shopId]
  );
  return row?.cnt ?? 0;
}

async function countCustomers(db, shopId) {
  const row = await db.get(
    `SELECT COUNT(*) AS cnt FROM Customers WHERE shop_id = ?`,
    [shopId]
  );
  return row?.cnt ?? 0;
}

async function countBroadcastsThisMonth(db, shopId) {
  const row = await db.get(
    `SELECT COUNT(*) AS cnt FROM Broadcasts
     WHERE shop_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
    [shopId]
  );
  return row?.cnt ?? 0;
}

async function countProducts(db, shopId) {
  const row = await db.get(
    `SELECT COUNT(*) AS cnt FROM Products WHERE shop_id = ?`,
    [shopId]
  );
  return row?.cnt ?? 0;
}

// ─── Middleware factory ───────────────────────────────────────

/**
 * checkPlanLimit(resource)
 *
 * @param {'pages'|'staff'|'customers'|'broadcasts_month'|'products'} resource
 *
 * Usage:
 *   router.post('/', requireOwnerOrAdmin, checkPlanLimit('staff'), handler)
 */
function checkPlanLimit(resource) {
  return async (req, res, next) => {
    try {
      const db = getDB();
      const shopId = req.shop?.shopId;
      if (!shopId) return next(); // guard

      // Load plan từ Shops
      const shop = await db.get(
        `SELECT subscription_plan, license_status FROM Shops WHERE id = ?`,
        [shopId]
      );
      if (!shop) return res.status(403).json({ error: 'Shop không tồn tại.' });

      // ENTERPRISE → unlimited
      const plan = (shop.subscription_plan || 'FREE').toUpperCase();
      if (plan === 'ENTERPRISE') return next();

      const limits = getLimits(plan);
      const limit  = limits[resource];
      if (!limit || limit === Infinity) return next();

      // Count current usage
      let current = 0;
      switch (resource) {
        case 'pages':            current = await countPages(db, shopId); break;
        case 'staff':            current = await countStaff(db, shopId); break;
        case 'customers':        current = await countCustomers(db, shopId); break;
        case 'broadcasts_month': current = await countBroadcastsThisMonth(db, shopId); break;
        case 'products':         current = await countProducts(db, shopId); break;
        default: return next();
      }

      if (current >= limit) {
        return res.status(402).json({
          error: `Đã đạt giới hạn gói ${plan}: tối đa ${limit} ${resourceLabel(resource)}.`,
          code: 'PLAN_LIMIT_EXCEEDED',
          resource,
          current,
          limit,
          plan,
          upgrade_url: '/settings/billing',
        });
      }

      // Gắn metadata vào req để handler biết
      req.planInfo = { plan, current, limit };
      next();
    } catch (err) {
      console.error('[PLAN LIMIT] Error:', err.message);
      next(); // fail-open: không block user nếu check lỗi
    }
  };
}

function resourceLabel(resource) {
  const labels = {
    pages:            'fanpage',
    staff:            'nhân viên',
    customers:        'khách hàng',
    broadcasts_month: 'chiến dịch/tháng',
    products:         'sản phẩm',
  };
  return labels[resource] || resource;
}

/**
 * getPlanUsage(shopId) — dùng cho dashboard hiển thị quota
 */
async function getPlanUsage(shopId) {
  const db = getDB();
  const shop = await db.get(
    `SELECT subscription_plan FROM Shops WHERE id = ?`, [shopId]
  );
  const plan   = (shop?.subscription_plan || 'FREE').toUpperCase();
  const limits = getLimits(plan);

  const [pages, staff, customers, broadcasts, products] = await Promise.all([
    countPages(db, shopId),
    countStaff(db, shopId),
    countCustomers(db, shopId),
    countBroadcastsThisMonth(db, shopId),
    countProducts(db, shopId),
  ]);

  return {
    plan,
    usage: {
      pages:            { current: pages,      limit: limits.pages },
      staff:            { current: staff,       limit: limits.staff },
      customers:        { current: customers,   limit: limits.customers },
      broadcasts_month: { current: broadcasts,  limit: limits.broadcasts_month },
      products:         { current: products,    limit: limits.products },
      ai_messages_day:  { current: 0,           limit: limits.ai_messages_day }, // from Shops.ai_messages_used
    },
  };
}

module.exports = { checkPlanLimit, getPlanUsage, getLimits, PLAN_LIMITS };
