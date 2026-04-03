'use strict';

const { getDB } = require('../../infra/database/sqliteConnection');

/**
 * Gán khách mới cho Staff bằng Round-Robin Atomically
 * - Dùng UPDATE ... RETURNING để lấy nhân viên rảnh nhất dựa theo last_assigned_at.
 * @param {number} shopId
 * @param {number} customerId
 * @returns {Promise<{staffId: number|null, staffName: string|null}>}
 */
async function assignCustomerRoundRobin(shopId, customerId) {
  const db = getDB();

  // 1. Kiểm tra xem Shop có bật Auto-assign không
  const shop = await db.get('SELECT auto_assign_staff FROM Shops WHERE id = ?', [shopId]);
  if (!shop || shop.auto_assign_staff !== 1) {
    return { staffId: null, staffName: null };
  }

  // 2. Tìm Sale rảnh nhất và Atomically Update (Tránh Race Condition)
  const result = await db.get(`
    UPDATE Staff 
    SET last_assigned_at = CURRENT_TIMESTAMP
    WHERE id = (
      SELECT id FROM Staff 
      WHERE shop_id = ? AND is_online = 1 AND role = 'staff'
      ORDER BY last_assigned_at ASC NULLS FIRST
      LIMIT 1
    )
    RETURNING id, name;
  `, [shopId]);

  if (!result) {
    console.log(`[ROUTING] Shop #${shopId}: Không có Staff online (hoặc lỗi cấu hình) → chưa gán.`);
    return { staffId: null, staffName: null };
  }

  // 3. Gán khách
  await db.run('UPDATE Customers SET assigned_to = ? WHERE id = ?', [result.id, customerId]);

  console.log(`[ROUTING] ✅ Khách #${customerId} → Staff "${result.name}" (ID: ${result.id})`);

  // 4. Bắn thông báo qua Socket
  try {
    const { getIO } = require('../../infra/socket/socketManager');
    const io = getIO();
    if (io) {
      io.to(String(shopId)).emit('customer_assigned', {
        customerId,
        staffId: result.id,
        staffName: result.name
      });
    }
  } catch (err) {
    console.error('[ROUTING] Socket error:', err.message);
  }

  return { staffId: result.id, staffName: result.name };
}

/**
 * Chuyển hội thoại sang Staff khác
 */
async function transferCustomer(customerId, newStaffId) {
  const db = getDB();
  await db.run('UPDATE Customers SET assigned_to = ? WHERE id = ?', [newStaffId, customerId]);
  const staff = await db.get('SELECT name FROM Staff WHERE id = ?', [newStaffId]);
  console.log(`[ROUTING] 🔄 Chuyển khách #${customerId} → Staff "${staff?.name}"`);
  return staff?.name || 'Unknown';
}

module.exports = { assignCustomerRoundRobin, transferCustomer };
