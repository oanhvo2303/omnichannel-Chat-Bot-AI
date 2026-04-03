'use strict';

const { getDB } = require('../../infra/database/sqliteConnection');

// =============================================
// Order Executor — Agent thực thi tạo đơn từ AI
// Tách riêng khỏi Controller để dễ test + maintain
// =============================================

/**
 * Thực thi tạo đơn hàng do AI yêu cầu.
 * - Fuzzy-match product_name với DB
 * - Kiểm tra tồn kho
 * - Dedup chống spam (2 phút)
 * - INSERT Order + OrderItems + trừ kho
 * - Cập nhật SĐT/Địa chỉ khách
 *
 * @param {object} args — Arguments từ Gemini Function Call
 * @param {string} args.product_name — Tên SP khách muốn mua
 * @param {number} [args.quantity=1] — Số lượng
 * @param {string} args.customer_phone — SĐT
 * @param {string} args.customer_address — Địa chỉ giao hàng
 * @param {number} shopId
 * @param {number} customerId
 * @returns {Promise<{success: boolean, orderId?: number, totalAmount?: number, productName?: string, error?: string}>}
 */
async function executeAIOrder(args, shopId, customerId) {
  const db = getDB();
  const { product_name, quantity = 1, customer_phone, customer_address, customer_name } = args;

  console.log('═'.repeat(60));
  console.log('[ORDER EXECUTOR] 🤖 AI yêu cầu tạo đơn hàng');
  console.log(`[ORDER EXECUTOR]   📦 Shop #${shopId} | 👤 Khách #${customerId}`);
  console.log(`[ORDER EXECUTOR]   🛍️  SP: "${product_name}" x${quantity}`);
  console.log(`[ORDER EXECUTOR]   👤 Tên người nhận: ${customer_name || '(dùng tên Facebook)'}`);
  console.log(`[ORDER EXECUTOR]   📱 SĐT: ${customer_phone}`);
  console.log(`[ORDER EXECUTOR]   📍 Địa chỉ: ${customer_address}`);
  console.log('═'.repeat(60));

  try {
    // ═══════════════════════════════════════════
    // GUARD 1: Anti-Spam Deduplication (2 phút)
    // ═══════════════════════════════════════════
    const recentOrder = await db.get(
      `SELECT id, total_amount, created_at FROM Orders 
       WHERE customer_id = ? AND shop_id = ? 
         AND created_at > datetime('now', '-2 minutes') 
         AND note LIKE '%AI Bot%'
       ORDER BY created_at DESC LIMIT 1`,
      [customerId, shopId]
    );

    if (recentOrder) {
      console.log(`[ORDER EXECUTOR] ⚠️ DEDUP: Đã có đơn #${recentOrder.id} trong 2 phút gần đây. CHẶN tạo trùng.`);
      return {
        success: false,
        error: 'duplicate',
        orderId: recentOrder.id,
        message: `Đơn hàng #${recentOrder.id} đã được tạo trước đó rồi ạ.`,
      };
    }

    // ═══════════════════════════════════════════
    // GUARD 2: Fuzzy-match sản phẩm trong kho
    // ═══════════════════════════════════════════
    // Tách từ khóa từ tên sản phẩm để match linh hoạt
    const keywords = product_name
      .toLowerCase()
      .replace(/[^a-zA-ZÀ-ỹ0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1);

    let product = null;

    // Strategy 1: LIKE match với toàn bộ tên
    product = await db.get(
      `SELECT * FROM Products WHERE shop_id = ? AND LOWER(name) LIKE ? AND stock_quantity > 0`,
      [shopId, `%${product_name.toLowerCase()}%`]
    );

    // Strategy 2: Match từng từ khóa
    if (!product && keywords.length > 0) {
      for (const kw of keywords) {
        product = await db.get(
          `SELECT * FROM Products WHERE shop_id = ? AND LOWER(name) LIKE ? AND stock_quantity > 0`,
          [shopId, `%${kw}%`]
        );
        if (product) break;
      }
    }

    if (!product) {
      console.log(`[ORDER EXECUTOR] ❌ Không tìm thấy SP "${product_name}" trong kho Shop #${shopId}`);
      return {
        success: false,
        error: 'product_not_found',
        message: `Shop chưa có sản phẩm "${product_name}" trong kho ạ. Bạn có thể mô tả rõ hơn không?`,
      };
    }

    console.log(`[ORDER EXECUTOR] ✅ Match SP: "${product.name}" (ID #${product.id}) — ${product.price?.toLocaleString()}đ | Kho: ${product.stock_quantity}`);

    // ═══════════════════════════════════════════
    // GUARD 3: Kiểm tra tồn kho
    // ═══════════════════════════════════════════
    if (product.stock_quantity < quantity) {
      console.log(`[ORDER EXECUTOR] ❌ Hết hàng: "${product.name}" chỉ còn ${product.stock_quantity}, khách yêu cầu ${quantity}`);
      return {
        success: false,
        error: 'out_of_stock',
        message: `Rất tiếc, "${product.name}" chỉ còn ${product.stock_quantity} sản phẩm trong kho ạ.`,
      };
    }

    // ═══════════════════════════════════════════
    // EXECUTE: Tạo đơn hàng
    // ═══════════════════════════════════════════
    const totalAmount = product.price * quantity;

    const orderResult = await db.run(
      `INSERT INTO Orders (shop_id, customer_id, total_amount, note, marketplace_source, recipient_name) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shopId, customerId, totalAmount, `[AI Bot tự động tạo] SP: ${product.name} x${quantity}`, 'internal', customer_name || null]
    );
    const orderId = orderResult.lastID;

    // Tạo OrderItems
    await db.run(
      'INSERT INTO OrderItems (order_id, product_id, name, quantity, price) VALUES (?, ?, ?, ?, ?)',
      [orderId, product.id, product.name, quantity, product.price]
    );

    // Trừ kho
    await db.run(
      'UPDATE Products SET stock_quantity = stock_quantity - ? WHERE id = ? AND shop_id = ?',
      [quantity, product.id, shopId]
    );

    // Cập nhật SĐT + Địa chỉ khách nếu chưa có
    const customer = await db.get('SELECT phone, address FROM Customers WHERE id = ? AND shop_id = ?', [customerId, shopId]);
    const updates = [];
    const vals = [];
    if (customer_phone && !customer?.phone) {
      updates.push('phone = ?');
      vals.push(customer_phone);
    }
    if (customer_address && !customer?.address) {
      updates.push('address = ?');
      vals.push(customer_address);
    }
    if (updates.length > 0) {
      vals.push(customerId, shopId);
      await db.run(`UPDATE Customers SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`, vals);
      console.log(`[ORDER EXECUTOR] 📝 Cập nhật CRM: ${updates.join(', ')} cho Khách #${customerId}`);
    }

    console.log('═'.repeat(60));
    console.log(`[ORDER EXECUTOR] ✅✅✅ ĐƠN HÀNG #${orderId} ĐÃ TẠO THÀNH CÔNG`);
    console.log(`[ORDER EXECUTOR]   🛍️  ${product.name} x${quantity} = ${totalAmount.toLocaleString()}đ`);
    console.log(`[ORDER EXECUTOR]   👤 Người nhận: ${customer_name || '(tên Facebook)'}`);
    console.log(`[ORDER EXECUTOR]   📱 ${customer_phone} | 📍 ${customer_address}`);
    console.log(`[ORDER EXECUTOR]   🤖 Created by: AI Bot`);
    console.log('═'.repeat(60));

    return {
      success: true,
      orderId,
      totalAmount,
      productName: product.name,
      productPrice: product.price,
      quantity,
      message: `Đơn hàng #${orderId} đã được tạo thành công. Sản phẩm: ${product.name} x${quantity}, tổng: ${totalAmount.toLocaleString()}đ.`,
    };

  } catch (error) {
    console.error('[ORDER EXECUTOR] ❌ Lỗi tạo đơn:', error.message);
    console.error('[ORDER EXECUTOR] Stack:', error.stack?.substring(0, 300));
    return {
      success: false,
      error: 'db_error',
      message: 'Có lỗi hệ thống khi tạo đơn hàng. Vui lòng thử lại.',
    };
  }
}

module.exports = { executeAIOrder };
