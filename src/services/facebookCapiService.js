'use strict';

const crypto = require('crypto');
const { getDB } = require('../infra/database/sqliteConnection');

/**
 * Hash data chuẩn của Meta CAPI:
 * 1. Convert to lowercase
 * 2. Remove all whitespaces
 * 3. Hash with SHA-256
 * @param {string} value
 * @returns {string} hashed value
 */
const normalizeAndHash = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase().replace(/\s/g, '');
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

/**
 * Gửi Event (Lead / Purchase) lên Facebook Conversions API (CAPI).
 * Không ném ra lỗi để tránh chặn luồng chính của hệ thống.
 * 
 * @param {Object} params
 * @param {number|string} params.shopId
 * @param {string} params.eventName "Lead" hoặc "Purchase"
 * @param {string} [params.phone] Số điện thoại (chưa hash)
 * @param {string} [params.email] Email (chưa hash)
 * @param {string} [params.eventId] ID chống trùng lặp sự kiện (Deduplication)
 * @param {Object} [params.customData] Ví dụ value: 150000, currency: 'VND'
 */
const sendCapiEvent = async ({ shopId, eventName, phone, email, eventId, customData = {} }) => {
  try {
    const db = getDB();
    const config = await db.get(
      'SELECT pixel_id, capi_token, test_event_code, is_active FROM ShopTracking WHERE shop_id = ?',
      [shopId]
    );

    // Không gửi nếu như chưa cấu hình hoặc CAPI đang tắt
    if (!config || !config.pixel_id || !config.capi_token || config.is_active !== 1) {
      return;
    }

    const hashedPhone = normalizeAndHash(phone);
    const hashedEmail = normalizeAndHash(email);

    if (!hashedPhone && !hashedEmail) {
      console.warn(`[CAPI] Bỏ qua gửi event ${eventName} vì thiếu cả Email và SĐT để matching.`);
      return;
    }

    const userData = {};
    if (hashedPhone) userData.ph = [hashedPhone];
    if (hashedEmail) userData.em = [hashedEmail];

    const event = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      user_data: userData,
    };

    if (Object.keys(customData).length > 0) {
      event.custom_data = customData;
    }

    if (eventId) {
      event.event_id = eventId;
    }

    const payload = { data: [event] };
    if (config.test_event_code) {
      payload.test_event_code = config.test_event_code;
    }

    const apiUrl = `https://graph.facebook.com/v19.0/${config.pixel_id}/events?access_token=${config.capi_token}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`[CAPI - Facebook Reject] ${eventName} - Shop ${shopId}:`, result.error?.message || result);
    } else {
      console.log(`[CAPI - Success] Đã bắn event ${eventName} - Shop ${shopId} - Events Received: ${result.events_received}`);
    }
  } catch (error) {
    console.error(`[CAPI - Internal Error] Error sending ${eventName}:`, error.message);
  }
};

module.exports = {
  normalizeAndHash,
  sendCapiEvent
};
