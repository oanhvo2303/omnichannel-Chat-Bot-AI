'use strict';

/**
 * Marketplace Sync Cron Job
 *
 * Chạy mỗi 5 phút: đồng bộ đơn hàng + tin nhắn từ Shopee/TikTok
 */

const { getDB } = require('../../infra/database/sqliteConnection');
const { getIO } = require('../../infra/socket/socketManager');
const shopeeService = require('../services/shopeeService');
const tiktokService = require('../services/tiktokService');

// Status mapping
const SHOPEE_STATUS_MAP = {
  UNPAID: 'pending',
  READY_TO_SHIP: 'confirmed',
  PROCESSED: 'confirmed',
  SHIPPED: 'shipping',
  COMPLETED: 'completed',
  IN_CANCEL: 'cancelled',
  CANCELLED: 'cancelled',
  INVOICE_PENDING: 'pending',
};

const TIKTOK_STATUS_MAP = {
  AWAITING_SHIPMENT: 'confirmed',
  AWAITING_COLLECTION: 'confirmed',
  IN_TRANSIT: 'shipping',
  DELIVERED: 'completed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ON_HOLD: 'pending',
  PARTIALLY_SHIPPING: 'shipping',
};

/**
 * Đồng bộ đơn hàng + tin nhắn Shopee cho 1 shop
 */
async function syncShopee(shop) {
  const db = getDB();
  const io = getIO();

  if (!shop.shopee_access_token || !shop.shopee_shop_id) return;

  console.log(`[SYNC SHOPEE] Shop #${shop.id}: Đồng bộ...`);

  try {
    // === SYNC ORDERS ===
    const orders = await shopeeService.getShopeeOrders(shop.shopee_access_token, shop.shopee_shop_id, 15);

    if (orders.length > 0) {
      const orderSns = orders.map((o) => o.order_sn);
      const details = await shopeeService.getShopeeOrderDetail(shop.shopee_access_token, shop.shopee_shop_id, orderSns);

      for (const order of details) {
        // Check nếu đã tồn tại
        const existing = await db.get('SELECT id FROM Orders WHERE marketplace_order_id = ? AND shop_id = ?', [order.order_sn, shop.id]);
        if (existing) {
          // Cập nhật status
          const status = SHOPEE_STATUS_MAP[order.order_status] || 'pending';
          await db.run('UPDATE Orders SET status = ?, marketplace_status = ? WHERE id = ?', [status, order.order_status, existing.id]);
          continue;
        }

        // Upsert customer
        const buyerId = `shopee_${order.buyer_user_id || order.buyer_username}`;
        await db.run('INSERT OR IGNORE INTO Customers (shop_id, platform_id, platform, name) VALUES (?, ?, ?, ?)',
          [shop.id, buyerId, 'shopee', order.buyer_username || 'Shopee Buyer']
        );
        const customer = await db.get('SELECT id FROM Customers WHERE shop_id = ? AND platform_id = ?', [shop.id, buyerId]);

        const status = SHOPEE_STATUS_MAP[order.order_status] || 'pending';
        const totalAmount = order.total_amount || 0;

        const result = await db.run(
          `INSERT INTO Orders (shop_id, customer_id, total_amount, status, marketplace_source, marketplace_order_id, marketplace_status, tracking_code, shipping_provider)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [shop.id, customer?.id, totalAmount, status, 'shopee', order.order_sn, order.order_status,
           order.tracking_no || null, order.shipping_carrier || null]
        );

        // Insert items
        if (order.item_list) {
          for (const item of order.item_list) {
            await db.run('INSERT INTO OrderItems (order_id, name, quantity, price) VALUES (?, ?, ?, ?)',
              [result.lastID, item.item_name || 'SP Shopee', item.model_quantity_purchased || 1, item.model_discounted_price || 0]
            );
          }
        }

        console.log(`[SYNC SHOPEE] ✅ Đơn ${order.order_sn} → #${result.lastID} (${status})`);
      }
    }

    // === SYNC MESSAGES ===
    const conversations = await shopeeService.getShopeeConversations(shop.shopee_access_token, shop.shopee_shop_id);

    for (const conv of conversations.slice(0, 10)) {
      const buyerId = `shopee_${conv.to_id}`;
      await db.run('INSERT OR IGNORE INTO Customers (shop_id, platform_id, platform, name) VALUES (?, ?, ?, ?)',
        [shop.id, buyerId, 'shopee', conv.to_name || 'Shopee User']
      );
      const customer = await db.get('SELECT id FROM Customers WHERE shop_id = ? AND platform_id = ?', [shop.id, buyerId]);
      if (!customer) continue;

      const messages = await shopeeService.getShopeeMessages(shop.shopee_access_token, shop.shopee_shop_id, conv.conversation_id, 10);

      for (const msg of messages) {
        const msgId = `shopee_msg_${msg.message_id}`;
        const exists = await db.get('SELECT id FROM Messages WHERE shop_id = ? AND text = ? AND customer_id = ? AND comment_id = ?',
          [shop.id, msg.content?.text || '', customer.id, msgId]
        );
        if (exists) continue;

        const sender = msg.from_id === parseInt(shop.shopee_shop_id) ? 'bot' : 'customer';
        await db.run(
          'INSERT INTO Messages (shop_id, customer_id, sender, text, type, comment_id) VALUES (?, ?, ?, ?, ?, ?)',
          [shop.id, customer.id, sender, msg.content?.text || '[Media]', 'inbox', msgId]
        );
      }
    }

    console.log(`[SYNC SHOPEE] Shop #${shop.id}: Hoàn tất.`);
  } catch (error) {
    console.error(`[SYNC SHOPEE] Shop #${shop.id}: Lỗi:`, error.message);
  }
}

/**
 * Đồng bộ đơn hàng + tin nhắn TikTok Shop cho 1 shop
 */
async function syncTikTok(shop) {
  const db = getDB();

  if (!shop.tiktok_access_token || !shop.tiktok_shop_id) return;

  console.log(`[SYNC TIKTOK] Shop #${shop.id}: Đồng bộ...`);

  try {
    // === SYNC ORDERS ===
    const orders = await tiktokService.getTikTokOrders(shop.tiktok_access_token, shop.tiktok_shop_id, 15);

    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.order_id);
      const details = await tiktokService.getTikTokOrderDetail(shop.tiktok_access_token, shop.tiktok_shop_id, orderIds);

      for (const order of details) {
        const existing = await db.get('SELECT id FROM Orders WHERE marketplace_order_id = ? AND shop_id = ?', [order.order_id, shop.id]);
        if (existing) {
          const status = TIKTOK_STATUS_MAP[order.order_status] || 'pending';
          await db.run('UPDATE Orders SET status = ?, marketplace_status = ? WHERE id = ?', [status, order.order_status, existing.id]);
          continue;
        }

        const buyerId = `tiktok_${order.buyer_uid || order.order_id}`;
        await db.run('INSERT OR IGNORE INTO Customers (shop_id, platform_id, platform, name) VALUES (?, ?, ?, ?)',
          [shop.id, buyerId, 'tiktok', order.buyer_message?.buyer_name || 'TikTok Buyer']
        );
        const customer = await db.get('SELECT id FROM Customers WHERE shop_id = ? AND platform_id = ?', [shop.id, buyerId]);

        const status = TIKTOK_STATUS_MAP[order.order_status] || 'pending';
        const totalAmount = parseFloat(order.payment_info?.total_amount || 0);

        const result = await db.run(
          `INSERT INTO Orders (shop_id, customer_id, total_amount, status, marketplace_source, marketplace_order_id, marketplace_status, tracking_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [shop.id, customer?.id, totalAmount, status, 'tiktok', order.order_id, order.order_status,
           order.tracking_number || null]
        );

        // Items
        if (order.item_list) {
          for (const item of order.item_list) {
            await db.run('INSERT INTO OrderItems (order_id, name, quantity, price) VALUES (?, ?, ?, ?)',
              [result.lastID, item.product_name || 'SP TikTok', item.quantity || 1, parseFloat(item.sale_price || 0)]
            );
          }
        }

        console.log(`[SYNC TIKTOK] ✅ Đơn ${order.order_id} → #${result.lastID} (${status})`);
      }
    }

    // === SYNC MESSAGES ===
    const conversations = await tiktokService.getTikTokConversations(shop.tiktok_access_token, shop.tiktok_shop_id);

    for (const conv of conversations.slice(0, 10)) {
      const buyerId = `tiktok_${conv.buyer_id || conv.conversation_id}`;
      await db.run('INSERT OR IGNORE INTO Customers (shop_id, platform_id, platform, name) VALUES (?, ?, ?, ?)',
        [shop.id, buyerId, 'tiktok', conv.buyer_name || 'TikTok User']
      );
      // Messages will be synced on next iteration or when detailed fetch is implemented
    }

    console.log(`[SYNC TIKTOK] Shop #${shop.id}: Hoàn tất.`);
  } catch (error) {
    console.error(`[SYNC TIKTOK] Shop #${shop.id}: Lỗi:`, error.message);
  }
}

/**
 * Master sync: quét tất cả shops và đồng bộ
 */
async function runMarketplaceSync() {
  const db = getDB();
  const shops = await db.all('SELECT * FROM Shops WHERE shopee_shop_id IS NOT NULL OR tiktok_shop_id IS NOT NULL');

  if (shops.length === 0) return;

  console.log(`[SYNC] 🔄 Đồng bộ sàn TMĐT cho ${shops.length} shop(s)...`);

  for (const shop of shops) {
    await syncShopee(shop);
    await syncTikTok(shop);
  }

  console.log(`[SYNC] ✅ Đồng bộ hoàn tất.`);
}

// === AUTO-START CRON: Mỗi 5 phút ===
let syncInterval = null;

function startMarketplaceSync() {
  if (syncInterval) return;
  console.log('[SYNC] ⏰ Cron job đồng bộ sàn TMĐT: mỗi 5 phút');
  syncInterval = setInterval(runMarketplaceSync, 5 * 60 * 1000);
  // Run once immediately on startup (delayed 10s to let DB init)
  setTimeout(runMarketplaceSync, 10000);
}

function stopMarketplaceSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

module.exports = { runMarketplaceSync, startMarketplaceSync, stopMarketplaceSync };
