'use strict';

const express = require('express');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');
const { getPlanUsage, PLAN_LIMITS } = require('../services/planLimitService');
const { getDB } = require('../../infra/database/sqliteConnection');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/billing/usage
 * Trả về current plan + usage stats cho dashboard
 */
router.get('/usage', async (req, res) => {
  try {
    const shopId = req.shop.shopId;
    const usage = await getPlanUsage(shopId);

    // Thêm ai_messages_used từ Shops table
    const db = getDB();
    const shop = await db.get(
      `SELECT ai_messages_used, ai_quota_limit, license_status, license_expires_at FROM Shops WHERE id = ?`,
      [shopId]
    );

    usage.usage.ai_messages_day.current = shop?.ai_messages_used ?? 0;
    usage.license_status   = shop?.license_status ?? 'ACTIVE';
    usage.license_expires_at = shop?.license_expires_at ?? null;

    res.json(usage);
  } catch (err) {
    console.error('[BILLING] Lỗi lấy usage:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/billing/plans
 * Public — danh sách plans và giới hạn (dùng cho pricing page)
 */
router.get('/plans', (req, res) => {
  const plans = Object.entries(PLAN_LIMITS).map(([name, limits]) => ({
    name,
    limits: Object.fromEntries(
      Object.entries(limits).map(([k, v]) => [k, v === Infinity ? 'unlimited' : v])
    ),
  }));
  res.json({ plans });
});

/**
 * PATCH /api/billing/plan — Admin cập nhật plan cho shop (super_admin only)
 * Dùng trong admin panel
 */
router.patch('/plan', requireOwnerOrAdmin, async (req, res) => {
  const { plan, license_expires_at } = req.body;
  const validPlans = ['FREE', 'PRO', 'ENTERPRISE'];
  if (!validPlans.includes((plan || '').toUpperCase())) {
    return res.status(400).json({ error: `Plan phải là: ${validPlans.join(', ')}` });
  }

  // Chỉ super_admin mới được tự đổi plan (owner bình thường không được)
  const role = (req.shop?.role || '').toLowerCase();
  if (!['super_admin'].includes(role)) {
    return res.status(403).json({ error: 'Chỉ Super Admin mới được đổi plan.' });
  }

  try {
    const db = getDB();
    await db.run(
      `UPDATE Shops SET subscription_plan = ?, license_expires_at = ? WHERE id = ?`,
      [plan.toUpperCase(), license_expires_at || null, req.shop.shopId]
    );
    res.json({ message: `Đã cập nhật plan → ${plan.toUpperCase()}` });
  } catch (err) {
    console.error('[BILLING] Lỗi update plan:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
