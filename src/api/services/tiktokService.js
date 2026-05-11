'use strict';

/**
 * TikTok Shop API Service
 *
 * Docs: https://partner.tiktokshop.com/docv2/
 * Base URL: https://open-api.tiktokglobalshop.com
 *
 * Cần: TIKTOK_APP_KEY, TIKTOK_APP_SECRET trong .env
 */

const crypto = require('crypto');

const TIKTOK_HOST = process.env.TIKTOK_API_URL || 'https://open-api.tiktokglobalshop.com';
const APP_KEY = process.env.TIKTOK_APP_KEY || '';
const APP_SECRET = process.env.TIKTOK_APP_SECRET || '';

/**
 * Tạo chữ ký HMAC-SHA256 cho TikTok Shop API
 */
function makeSign(path, timestamp, params = {}) {
  const sortedKeys = Object.keys(params).sort();
  let baseStr = `${APP_SECRET}${path}`;
  for (const key of sortedKeys) {
    baseStr += `${key}${params[key]}`;
  }
  baseStr += APP_SECRET;
  return crypto.createHmac('sha256', APP_SECRET).update(baseStr).digest('hex');
}

/**
 * Tạo URL OAuth TikTok Shop
 */
function getTikTokAuthUrl(redirectUrl, state = 'tiktok_oauth') {
  // state là signed payload từ marketplace.routes.js — chứng thực CSRF
  return `https://auth.tiktok-shops.com/oauth/authorize?app_key=${APP_KEY}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${encodeURIComponent(state)}`;
}

/**
 * Đổi auth code lấy access_token
 */
async function getTikTokToken(code) {
  const path = '/api/v2/token/get';

  try {
    const res = await fetch(`${TIKTOK_HOST}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_key: APP_KEY, app_secret: APP_SECRET, auth_code: code, grant_type: 'authorized_code' }),
    });
    return res.json();
  } catch (error) {
    console.error('[TIKTOK] Token error:', error.message);
    return { error: error.message };
  }
}

/**
 * Refresh access_token
 */
async function refreshTikTokToken(refreshToken) {
  const path = '/api/v2/token/refresh';

  try {
    const res = await fetch(`${TIKTOK_HOST}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_key: APP_KEY, app_secret: APP_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    return res.json();
  } catch (error) {
    console.error('[TIKTOK] Refresh error:', error.message);
    return { error: error.message };
  }
}

/**
 * Lấy danh sách đơn hàng TikTok Shop
 */
async function getTikTokOrders(accessToken, tiktokShopId, sinceMinutes = 15) {
  const path = '/api/orders/search';
  const timestamp = Math.floor(Date.now() / 1000);

  const createTimeFrom = timestamp - (sinceMinutes * 60);
  const params = {
    app_key: APP_KEY,
    timestamp: String(timestamp),
    shop_id: tiktokShopId,
    access_token: accessToken,
  };
  const sign = makeSign(path, timestamp, params);

  const qs = new URLSearchParams({ ...params, sign, page_size: '50', create_time_from: String(createTimeFrom), create_time_to: String(timestamp) });

  try {
    const res = await fetch(`${TIKTOK_HOST}${path}?${qs}`);
    const data = await res.json();
    return data.data?.order_list || [];
  } catch (error) {
    console.error('[TIKTOK] Lỗi lấy đơn:', error.message);
    return [];
  }
}

/**
 * Lấy chi tiết đơn TikTok
 */
async function getTikTokOrderDetail(accessToken, tiktokShopId, orderIds) {
  const path = '/api/orders/detail/query';
  const timestamp = Math.floor(Date.now() / 1000);

  const params = { app_key: APP_KEY, timestamp: String(timestamp), shop_id: tiktokShopId, access_token: accessToken };
  const sign = makeSign(path, timestamp, params);

  try {
    const res = await fetch(`${TIKTOK_HOST}${path}?${new URLSearchParams({ ...params, sign })}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id_list: orderIds }),
    });
    const data = await res.json();
    return data.data?.order_list || [];
  } catch (error) {
    console.error('[TIKTOK] Lỗi chi tiết đơn:', error.message);
    return [];
  }
}

/**
 * Lấy conversations TikTok Shop
 */
async function getTikTokConversations(accessToken, tiktokShopId) {
  const path = '/api/v2/customer_service/conversation/list';
  const timestamp = Math.floor(Date.now() / 1000);

  const params = { app_key: APP_KEY, timestamp: String(timestamp), shop_id: tiktokShopId, access_token: accessToken };
  const sign = makeSign(path, timestamp, params);

  try {
    const res = await fetch(`${TIKTOK_HOST}${path}?${new URLSearchParams({ ...params, sign, page_size: '25' })}`);
    const data = await res.json();
    return data.data?.conversation_list || [];
  } catch (error) {
    console.error('[TIKTOK] Lỗi conversations:', error.message);
    return [];
  }
}

/**
 * Gửi tin nhắn reply TikTok Shop
 */
async function sendTikTokMessage(accessToken, tiktokShopId, conversationId, text) {
  const path = '/api/v2/customer_service/message/send';
  const timestamp = Math.floor(Date.now() / 1000);

  const params = { app_key: APP_KEY, timestamp: String(timestamp), shop_id: tiktokShopId, access_token: accessToken };
  const sign = makeSign(path, timestamp, params);

  try {
    const res = await fetch(`${TIKTOK_HOST}${path}?${new URLSearchParams({ ...params, sign })}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, type: 'text', content: text }),
    });
    return res.json();
  } catch (error) {
    console.error('[TIKTOK] Lỗi gửi tin:', error.message);
    return { error: error.message };
  }
}

module.exports = {
  getTikTokAuthUrl, getTikTokToken, refreshTikTokToken,
  getTikTokOrders, getTikTokOrderDetail,
  getTikTokConversations, sendTikTokMessage,
};
