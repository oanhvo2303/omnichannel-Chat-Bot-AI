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
  const { product_name, customer_phone, customer_address, customer_name } = args;

  // Quantity: clamp [1, 999]
  let quantity = parseInt(args.quantity, 10);
  if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
  if (quantity > 999) quantity = 999;

  // P1b fix: Validate phone + address từ Gemini — không tin blindly
  const phoneClean = String(customer_phone || '').replace(/[\s\-\.\(\)]/g, '');
  const phoneValid = /^(0|\+84)(3|5|7|8|9)\d{8}$/.test(phoneClean);
  if (!phoneValid) {
    return {
      success: false,
      error: 'invalid_phone',
      message: `Số điện thoại "${customer_phone}" chưa đúng định dạng VN 10 số. Bạn vui lòng cho mình xin lại số điện thoại nhé! 📱`,
    };
  }

  const addressStr = String(customer_address || '').trim();
  if (addressStr.length < 10) {
    return {
      success: false,
      error: 'invalid_address',
      message: `Địa chỉ "${customer_address}" có vẻ chưa đủ thông tin. Bạn cho mình địa chỉ đầy đủ (số nhà, đường, phường/xã, quận/huyện) nhé! 📍`,
    };
  }

  console.log('═'.repeat(60));
  console.log('[ORDER EXECUTOR] 🤖 AI yêu cầu tạo đơn hàng');
  console.log(`[ORDER EXECUTOR]   📦 Shop #${shopId} | 👤 Khách #${customerId}`);
  console.log(`[ORDER EXECUTOR]   🛍️  SP: "${product_name}" x${quantity}${args.quantity != quantity ? ` (gốc: ${args.quantity} → clamped)` : ''}`);
  console.log(`[ORDER EXECUTOR]   👤 Tên người nhận: ${customer_name || '(dùng tên Facebook)'}`);
  console.log(`[ORDER EXECUTOR]   📱 SĐT: ${phoneClean}`);
  console.log(`[ORDER EXECUTOR]   📍 Địa chỉ: ${addressStr}`);
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

    // Bug 5 fix: Scored matching — lấy TẤT CẢ candidates, chọn product khớp nhiều keyword nhất
    // Tránh lấy nhầm sản phẩm đầu tiên khi có nhiều SP tên gần giống

    // Strategy 1: Exact full-name match (highest priority)
    product = await db.get(
      `SELECT * FROM Products WHERE shop_id = ? AND LOWER(name) = ? AND stock_quantity > 0`,
      [shopId, product_name.toLowerCase()]
    );

    if (!product) {
      // Strategy 2: Fetch candidates khớp bất kỳ keyword, score theo số keyword match
      const allProducts = await db.all(
        `SELECT * FROM Products WHERE shop_id = ? AND stock_quantity > 0`,
        [shopId]
      );

      let bestScore = 0;
      for (const p of allProducts) {
        const pName = p.name.toLowerCase().replace(/[^a-záàảãạăắặằẵẳâấậầẫẩđéèẻẽẹêếệềễểíìỉĩịóòỏõọôốộồỗổơớợờỡởúùủũụưứựừữửýỳỷỹỵ0-9\s]/g, '');
        // Tính số keyword của AI có trong tên sản phẩm
        const score = keywords.filter(kw => pName.includes(kw)).length;
        // Bonus: tên SP chứa nguyên chuỗi tên AI yêu cầu
        const fullBonus = pName.includes(product_name.toLowerCase()) ? 5 : 0;
        const total = score + fullBonus;
        if (total > bestScore) {
          bestScore = total;
          product = p;
        }
      }

      // Nếu score = 0 → không có SP nào match
      if (bestScore === 0) product = null;

      if (product) {
        console.log(`[ORDER EXECUTOR] 📊 Scored match: "${product.name}" (score=${bestScore}/${keywords.length}) cho yêu cầu "${product_name}"`);
      }
    }

    if (!product) {
      console.log(`[ORDER EXECUTOR] ❌ Không tìm thấy SP "${product_name}" trong kho Shop #${shopId}`);
      return {
        success: false,
        error: 'product_not_found',
        message: `Shop chưa có sản phẩm "${product_name}" trong kho 😔. Bạn có thể mô tả rõ hơn không?`,
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
    // EXECUTE: Tạo đơn hàng (với Volume Pricing + Shipping)
    // ═══════════════════════════════════════════

    // ★ Volume Pricing: Resolve giá theo số lượng
    let unitPrice = product.price;
    let volumeTierLabel = '';
    try {
      if (product.volume_pricing) {
        const tiers = JSON.parse(product.volume_pricing);
        if (Array.isArray(tiers) && tiers.length > 0) {
          // Tìm bậc giá cao nhất mà quantity >= min_qty
          for (const tier of tiers) {
            if (quantity >= tier.min_qty) {
              unitPrice = tier.price;
              volumeTierLabel = `(Giá sỉ từ ${tier.min_qty} sp)`;
            }
          }
        }
      }
    } catch { /* parse error — dùng giá gốc */ }

    const subtotal = unitPrice * quantity;

    // ★ Auto Shipping Fee
    const shopSettings = await db.get('SELECT default_shipping_fee, free_shipping_threshold, free_shipping_min_quantity FROM Shops WHERE id = ?', [shopId]);
    let shippingFee = shopSettings?.default_shipping_fee || 0;
    const freeThreshold = shopSettings?.free_shipping_threshold || 0;
    const freeMinQty = shopSettings?.free_shipping_min_quantity || 0;
    // Freeship nếu thỏa 1 trong 2 điều kiện
    if ((freeThreshold > 0 && subtotal >= freeThreshold) || (freeMinQty > 0 && quantity >= freeMinQty)) {
      shippingFee = 0;
    }

    const totalAmount = subtotal + shippingFee;

    // FIX: Wrap toàn bộ trong transaction + atomic stock deduct
    await db.run('BEGIN TRANSACTION');
    let orderId;
    try {
      const orderResult = await db.run(
        `INSERT INTO Orders (shop_id, customer_id, total_amount, subtotal, shipping_fee, note, marketplace_source, recipient_name) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [shopId, customerId, totalAmount, subtotal, shippingFee, `[AI Bot tự động tạo] SP: ${product.name} x${quantity}`, 'internal', customer_name || null]
      );
      orderId = orderResult.lastID;

      await db.run(
        'INSERT INTO OrderItems (order_id, product_id, name, quantity, price) VALUES (?, ?, ?, ?, ?)',
        [orderId, product.id, product.name, quantity, unitPrice]
      );

      // FIX: Atomic stock deduct — chống race condition oversell
      const stockResult = await db.run(
        'UPDATE Products SET stock_quantity = stock_quantity - ? WHERE id = ? AND shop_id = ? AND stock_quantity >= ?',
        [quantity, product.id, shopId, quantity]
      );
      if (stockResult.changes === 0) {
        await db.run('ROLLBACK');
        console.log(`[ORDER EXECUTOR] ⚠️ RACE: "${product.name}" vừa hết hàng trong khi xử lý`);
        return { success: false, error: 'out_of_stock', message: `Rất tiếc, "${product.name}" vừa hết hàng ạ. Vui lòng chọn sản phẩm khác.` };
      }
      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

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

    // ═══════════════════════════════════════════
    // ★ MẪU HÓA ĐƠN CHUYÊN NGHIỆP (Messenger Text)
    // ═══════════════════════════════════════════
    const displayName = customer_name || 'Quý khách';
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    const priceOriginal = product.price;
    const hasDiscount = unitPrice < priceOriginal;

    let billLines = [];
    billLines.push(`━━━━━━━━━━━━━━━━━━━━`);
    billLines.push(`🧾 ĐƠN HÀNG #${orderId}`);
    billLines.push(`━━━━━━━━━━━━━━━━━━━━`);
    billLines.push(``);
    billLines.push(`👤 ${displayName}`);
    if (customer_phone) billLines.push(`📱 ${customer_phone}`);
    if (customer_address) billLines.push(`📍 ${customer_address}`);
    billLines.push(``);
    billLines.push(`────────────────────`);
    billLines.push(`📦 ${product.name}`);
    if (hasDiscount) {
      billLines.push(`   ${quantity} x ${unitPrice.toLocaleString('vi-VN')}đ ${volumeTierLabel}`);
      billLines.push(`   (Giá gốc: ${priceOriginal.toLocaleString('vi-VN')}đ)`);
    } else {
      billLines.push(`   ${quantity} x ${unitPrice.toLocaleString('vi-VN')}đ`);
    }
    billLines.push(`────────────────────`);
    billLines.push(`   Tạm tính:  ${subtotal.toLocaleString('vi-VN')}đ`);
    if (shippingFee > 0) {
      billLines.push(`   Ship:      ${shippingFee.toLocaleString('vi-VN')}đ`);
    } else {
      billLines.push(`   Ship:      🎉 Miễn phí`);
    }
    billLines.push(`────────────────────`);
    billLines.push(`💰 TỔNG:     ${totalAmount.toLocaleString('vi-VN')}đ`);
    billLines.push(`━━━━━━━━━━━━━━━━━━━━`);
    billLines.push(``);
    billLines.push(`🕐 ${timeStr} — ${dateStr}`);
    billLines.push(`✅ Đơn hàng đã được ghi nhận!`);
    billLines.push(`Shop sẽ liên hệ xác nhận sớm nhất ạ 💛`);

    const billTemplate = billLines.join('\n');

    console.log('═'.repeat(60));
    console.log(`[ORDER EXECUTOR] ✅✅✅ ĐƠN HÀNG #${orderId} ĐÃ TẠO THÀNH CÔNG`);
    console.log(`[ORDER EXECUTOR]   🛍️  ${product.name} x${quantity} @ ${unitPrice.toLocaleString()}đ/sp = ${subtotal.toLocaleString()}đ`);
    if (hasDiscount) console.log(`[ORDER EXECUTOR]   💎 Volume pricing applied! Giá gốc: ${priceOriginal.toLocaleString()}đ → Giá sỉ: ${unitPrice.toLocaleString()}đ`);
    console.log(`[ORDER EXECUTOR]   🚚 Ship: ${shippingFee.toLocaleString()}đ | 💰 Total: ${totalAmount.toLocaleString()}đ`);
    console.log(`[ORDER EXECUTOR]   👤 Người nhận: ${displayName}`);
    console.log(`[ORDER EXECUTOR]   📱 ${customer_phone} | 📍 ${customer_address}`);
    console.log(`[ORDER EXECUTOR]   🤖 Created by: AI Bot`);
    console.log('═'.repeat(60));

    return {
      success: true,
      orderId,
      totalAmount,
      subtotal,
      shippingFee,
      unitPrice,
      productName: product.name,
      productPrice: product.price,
      quantity,
      billTemplate,
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
