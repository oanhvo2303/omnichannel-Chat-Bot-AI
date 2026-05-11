'use strict';

/**
 * Shopee Open Platform API Service
 *
 * Docs: https://open.shopee.com/documents/v2/
 * Base URL: https://partner.shopeemobile.com
 *
 * Cần: SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY trong .env
 * Shop owner kết nối qua OAuth → lấy shopee_access_token + shopee_refresh_token
 */

const crypto = require('crypto');

const SHOPEE_HOST = process.env.SHOPEE_API_URL || 'https://partner.shopeemobile.com';
const PARTNER_ID = parseInt(process.env.SHOPEE_PARTNER_ID || '0');
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || '';

/**
 * Tạo chữ ký HMAC-SHA256 cho Shopee API v2
 */
function makeSign(path, timestamp) {
  const baseStr = `${PARTNER_ID}${path}${timestamp}`;
  return crypto.createHmac('sha256', PARTNER_KEY).update(baseStr).digest('hex');
}

/**
 * Tạo URL OAuth Shopee (redirect shop owner đến Shopee để cấp quyền)
 */
function getShopeeAuthUrl(redirectUrl, state = '') {
  const path = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = makeSign(path, timestamp);
  // Nhúng state vào redirect URL (Shopee sẽ pass-through params của redirect)
  const redirectWithState = state
    ? `${redirectUrl}?state=${encodeURIComponent(state)}`
    : redirectUrl;
  return `${SHOPEE_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectWithState)}`;
}

/**
 * Đổi auth code lấy access_token + refresh_token
 */
async function getShopeeToken(code, shopId) {
  const path = '/api/v2/auth/token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = makeSign(path, timestamp);

  const res = await fetch(`${SHOPEE_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, shop_id: parseInt(shopId), partner_id: PARTNER_ID }),
  });

  return res.json();
}

/**
 * Refresh access_token
 */
async function refreshShopeeToken(refreshToken, shopeeShopId) {
  const path = '/api/v2/auth/access_token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = makeSign(path, timestamp);

  const res = await fetch(`${SHOPEE_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, shop_id: parseInt(shopeeShopId), partner_id: PARTNER_ID }),
  });

  return res.json();
}

/**
 * Lấy danh sách đơn hàng mới (15 phút gần nhất)
 */
async function getShopeeOrders(accessToken, shopeeShopId, sinceMinutes = 15) {
  const path = '/api/v2/order/get_order_list';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = makeSign(path, timestamp);

  const timeFrom = Math.floor(Date.now() / 1000) - (sinceMinutes * 60);
  const timeTo = Math.floor(Date.now() / 1000);

  const params = new URLSearchParams({
    partner_id: PARTNER_ID,
    timestamp,
    sign,
    access_token: accessToken,
    shop_id: shopeeShopId,
    time_range_field: 'create_time',
    time_from: timeFrom,
    time_to: timeTo,
    page_size: 50,
    order_status: 'ALL',
  });

  try {
    const res = await fetch(`${SHOPEE_HOST}${path}?${params}`);
    const data = await res.json();
    return data.response?.order_list || [];
  } catch (error) {
    console.error('[SHOPEE] Lỗi lấy đơn:', error.message);
    return [];
  }
}

/**
 * Lấy chi tiết đơn hàng (bao gồm sản phẩm, giá, địa chỉ)
 */
async function getShopeeOrderDetail(accessToken, shopeeShopId, orderSnList) {
  const path = '/api/v2/order/get_order_detail';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = makeSign(path, timestamp);

  const params = new URLSearchParams({
    partner_id: PARTNER_ID,
    timestamp,
    sign,
    access_token: accessToken,
    shop_id: shopeeShopId,
    order_sn_list: orderSnList.join(','),
    response_optional_fields: 'buyer_user_id,buyer_username,item_list,recipient_address,total_amount,order_status',
  });

  try {
    const res = await fetch(`${SHOPEE_HOST}${path}?${params}`);
    const data = await res.json();
    return data.response?.order_list || [];
  } catch (error) {
    console.error('[SHOPEE] Lỗi lấy chi tiết:', error.message);
    return [];
  }
}

/**
 * Lấy tin nhắn conversation từ Shopee
 */
async function getShopeeMessages(accessToken, shopeeShopId, conversationId, pageSize = 25) {
  const path = '/api/v2/sellerchat/get_message';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = makeSign(path, timestamp);

  const params = new URLSearchParams({
    partner_id: PARTNER_ID, timestamp, sign,
    access_token: accessToken, shop_id: shopeeShopId,
    conversation_id: conversationId, page_size: pageSize,
  });

  try {
    const res = await fetch(`${SHOPEE_HOST}${path}?${params}`);
    const data = await res.json();
    return data.response?.messages || [];
  } catch (error) {
    console.error('[SHOPEE] Lỗi lấy tin nhắn:', error.message);
    return [];
  }
}

/**
 * Lấy danh sách conversations gần đây
 */
async function getShopeeConversations(accessToken, shopeeShopId) {
  const path = '/api/v2/sellerchat/get_conversation_list';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = makeSign(path, timestamp);

  const params = new URLSearchParams({
    partner_id: PARTNER_ID, timestamp, sign,
    access_token: accessToken, shop_id: shopeeShopId,
    direction: 'latest', page_size: 25, type: 'all',
  });

  try {
    const res = await fetch(`${SHOPEE_HOST}${path}?${params}`);
    const data = await res.json();
    return data.response?.conversation_list || [];
  } catch (error) {
    console.error('[SHOPEE] Lỗi lấy conversations:', error.message);
    return [];
  }
}

/**
 * Gửi tin nhắn reply trên Shopee
 */
async function sendShopeeMessage(accessToken, shopeeShopId, conversationId, text) {
  const path = '/api/v2/sellerchat/send_message';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = makeSign(path, timestamp);

  try {
    const res = await fetch(`${SHOPEE_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&access_token=${accessToken}&shop_id=${shopeeShopId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_id: parseInt(conversationId), message_type: 'text', content: { text } }),
    });
    return res.json();
  } catch (error) {
    console.error('[SHOPEE] Lỗi gửi tin:', error.message);
    return { error: error.message };
  }
}

module.exports = {
  getShopeeAuthUrl, getShopeeToken, refreshShopeeToken,
  getShopeeOrders, getShopeeOrderDetail,
  getShopeeMessages, getShopeeConversations, sendShopeeMessage,
};
