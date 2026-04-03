'use strict';

const express = require('express');
const { getDB } = require('../../infra/database/sqliteConnection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/analytics/summary
 * Tổng quan Filter: tổng khách, đơn, doanh thu, conversion rate
 */
router.get('/summary', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { startDate, endDate } = req.query; // YYYY-MM-DD format

    let dateFilter = '';
    let params = [shopId];

    if (startDate && endDate) {
      dateFilter = ` AND DATE(created_at) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else {
      // Default to last 30 days if not provided
      dateFilter = ` AND created_at >= datetime('now', '-30 days')`;
    }

    const totalOrdersRow = await db.get(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue FROM Orders WHERE shop_id = ? AND status = 'completed' ${dateFilter}`, params);
    
    // Khách mới tạo trong kì
    const newCustomersRow = await db.get(`SELECT COUNT(*) as count FROM Customers WHERE shop_id = ? ${dateFilter}`, params);
    
    // Convert dateFilter of created_at to timestamp of messages
    let msgFilter = dateFilter.replace(/created_at/g, 'timestamp');
    const totalChatsRow = await db.get(`SELECT COUNT(DISTINCT customer_id) as count FROM Messages WHERE shop_id = ? ${msgFilter}`, params);

    const customers = totalChatsRow?.count || 0;
    const orders = totalOrdersRow?.count || 0;
    const newCustomers = newCustomersRow?.count || 0;
    const conversionRate = customers > 0 ? ((orders / customers) * 100).toFixed(1) : 0;

    res.json({
      totalRevenue: totalOrdersRow?.revenue || 0,
      totalOrders: orders,
      newCustomers: newCustomers,
      conversionRate: parseFloat(conversionRate),
    });
  } catch (error) {
    console.error('[ANALYTICS] Lỗi summary:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/analytics/performance
 * Gom nhóm ngày, tính % AI vs Sale theo attribution (tin nhắn cuối cùng trước thời điểm chốt đơn)
 */
router.get('/performance', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    let params = [shopId];

    if (startDate && endDate) {
      dateFilter = ` AND DATE(o.created_at) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    } else {
      dateFilter = ` AND o.created_at >= datetime('now', '-30 days')`;
    }

    const sql = `
      SELECT 
        DATE(o.created_at) as date,
        COUNT(o.id) as orders,
        COALESCE(SUM(o.total_amount), 0) as revenue,
        SUM(CASE WHEN (
          SELECT m.sender_type 
          FROM Messages m 
          WHERE m.customer_id = o.customer_id 
            AND m.shop_id = o.shop_id 
            AND m.sender_type IN ('bot', 'staff')
            AND m.timestamp <= o.created_at
          ORDER BY m.timestamp DESC 
          LIMIT 1
        ) = 'bot' THEN 1 ELSE 0 END) as ai_orders,
        SUM(CASE WHEN (
          SELECT m.sender_type 
          FROM Messages m 
          WHERE m.customer_id = o.customer_id 
            AND m.shop_id = o.shop_id 
            AND m.sender_type IN ('bot', 'staff')
            AND m.timestamp <= o.created_at
          ORDER BY m.timestamp DESC 
          LIMIT 1
        ) = 'staff' THEN 1 ELSE 0 END) as staff_orders,
        SUM(CASE WHEN (
          SELECT m.sender_type 
          FROM Messages m 
          WHERE m.customer_id = o.customer_id 
            AND m.shop_id = o.shop_id 
            AND m.sender_type IN ('bot', 'staff')
            AND m.timestamp <= o.created_at
          ORDER BY m.timestamp DESC 
          LIMIT 1
        ) = 'bot' THEN o.total_amount ELSE 0 END) as ai_revenue,
        SUM(CASE WHEN (
          SELECT m.sender_type 
          FROM Messages m 
          WHERE m.customer_id = o.customer_id 
            AND m.shop_id = o.shop_id 
            AND m.sender_type IN ('bot', 'staff')
            AND m.timestamp <= o.created_at
          ORDER BY m.timestamp DESC 
          LIMIT 1
        ) = 'staff' THEN o.total_amount ELSE 0 END) as staff_revenue
      FROM Orders o
      WHERE o.shop_id = ? ${dateFilter}
      GROUP BY DATE(o.created_at)
      ORDER BY date ASC
    `;

    const data = await db.all(sql, params);
    res.json(data);
  } catch (error) {
    console.error('[ANALYTICS] Lỗi performance:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/analytics/overview
 * Tổng quan: tổng khách, đơn, doanh thu, tin nhắn hôm nay, conversion rate
 */
router.get('/overview', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;

    const totalCustomers = await db.get('SELECT COUNT(*) as count FROM Customers WHERE shop_id = ?', [shopId]);
    const totalOrders = await db.get('SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue FROM Orders WHERE shop_id = ?', [shopId]);
    const todayMessages = await db.get(
      "SELECT COUNT(*) as count FROM Messages WHERE shop_id = ? AND DATE(timestamp) = DATE('now')",
      [shopId]
    );
    const todayOrders = await db.get(
      "SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue FROM Orders WHERE shop_id = ? AND DATE(created_at) = DATE('now')",
      [shopId]
    );
    const weekMessages = await db.get(
      "SELECT COUNT(*) as count FROM Messages WHERE shop_id = ? AND timestamp >= datetime('now', '-7 days')",
      [shopId]
    );

    const customers = totalCustomers?.count || 0;
    const orders = totalOrders?.count || 0;
    const conversionRate = customers > 0 ? ((orders / customers) * 100).toFixed(1) : 0;

    res.json({
      totalCustomers: customers,
      totalOrders: orders,
      totalRevenue: totalOrders?.revenue || 0,
      todayMessages: todayMessages?.count || 0,
      todayOrders: todayOrders?.count || 0,
      todayRevenue: todayOrders?.revenue || 0,
      weekMessages: weekMessages?.count || 0,
      conversionRate: parseFloat(conversionRate),
    });
  } catch (error) {
    console.error('[ANALYTICS] Lỗi overview:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/analytics/messages-by-day?days=14
 * Tin nhắn theo ngày (GROUP BY DATE)
 */
router.get('/messages-by-day', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const days = parseInt(req.query.days) || 14;

    const data = await db.all(`
      SELECT DATE(timestamp) as date,
             COUNT(*) as total,
             SUM(CASE WHEN sender = 'customer' THEN 1 ELSE 0 END) as from_customer,
             SUM(CASE WHEN sender = 'bot' THEN 1 ELSE 0 END) as from_bot
      FROM Messages
      WHERE shop_id = ? AND timestamp >= datetime('now', '-${days} days')
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `, [shopId]);

    res.json(data);
  } catch (error) {
    console.error('[ANALYTICS] Lỗi messages-by-day:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/analytics/orders-by-day?days=14
 * Đơn hàng và doanh thu theo ngày
 */
router.get('/orders-by-day', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const days = parseInt(req.query.days) || 14;

    const data = await db.all(`
      SELECT DATE(created_at) as date,
             COUNT(*) as orders,
             COALESCE(SUM(total_amount), 0) as revenue
      FROM Orders
      WHERE shop_id = ? AND created_at >= datetime('now', '-${days} days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [shopId]);

    res.json(data);
  } catch (error) {
    console.error('[ANALYTICS] Lỗi orders-by-day:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/analytics/order-status
 * Phân bổ trạng thái đơn hàng (pie chart)
 */
router.get('/order-status', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;

    const data = await db.all(`
      SELECT status, COUNT(*) as count
      FROM Orders WHERE shop_id = ?
      GROUP BY status
    `, [shopId]);

    res.json(data);
  } catch (error) {
    console.error('[ANALYTICS] Lỗi order-status:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/analytics/top-products?limit=5
 * Sản phẩm bán chạy nhất
 */
router.get('/top-products', async (req, res) => {
  try {
    const db = getDB();
    const shopId = req.shop.shopId;
    const limit = parseInt(req.query.limit) || 5;

    const data = await db.all(`
      SELECT oi.name, SUM(oi.quantity) as total_sold, SUM(oi.price * oi.quantity) as total_revenue
      FROM OrderItems oi
      INNER JOIN Orders o ON oi.order_id = o.id
      WHERE o.shop_id = ?
      GROUP BY oi.name
      ORDER BY total_sold DESC
      LIMIT ?
    `, [shopId, limit]);

    res.json(data);
  } catch (error) {
    console.error('[ANALYTICS] Lỗi top-products:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
