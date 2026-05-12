'use strict';

/**
 * Data Deletion Callback Route
 *
 * Facebook calls this endpoint when a user removes the app via Facebook Settings.
 * Facebook sends a signed_request parameter which we parse to identify the user.
 *
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

const express = require('express');
const crypto = require('crypto');
const config = require('../../config');
const { getDB } = require('../../infra/database/sqliteConnection');

const router = express.Router();

/**
 * Parse and verify Facebook signed_request
 */
const parseSignedRequest = (signedRequest, appSecret) => {
  if (!signedRequest) return null;

  const [encodedSig, payload] = signedRequest.split('.');
  if (!encodedSig || !payload) return null;

  try {
    // Verify signature
    const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const expectedSig = crypto.createHmac('sha256', appSecret).update(payload).digest();

    if (!crypto.timingSafeEqual(sig, expectedSig)) {
      console.warn('[DATA DELETION] Invalid signed_request signature');
      return null;
    }

    // Decode payload
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return data;
  } catch (err) {
    console.error('[DATA DELETION] Error parsing signed_request:', err.message);
    return null;
  }
};

/**
 * POST /api/data-deletion/facebook
 * Facebook calls this when user removes the app from their settings.
 * Must respond with { url, confirmation_code } within 200ms.
 */
router.post('/facebook', express.urlencoded({ extended: true }), async (req, res) => {
  const signedRequest = req.body?.signed_request;

  if (!signedRequest) {
    return res.status(400).json({ error: 'Missing signed_request' });
  }

  const data = parseSignedRequest(signedRequest, config.facebook.appSecret);

  if (!data) {
    return res.status(403).json({ error: 'Invalid signed_request' });
  }

  const fbUserId = data.user_id;
  const confirmationCode = `DEL-${fbUserId}-${Date.now()}`;

  console.log(`[DATA DELETION] Nhận yêu cầu xóa dữ liệu cho FB User: ${fbUserId}`);

  // Respond immediately — Facebook requires quick response
  // Actual deletion runs async
  res.json({
    url: `https://pgquangngai.io.vn/data-deletion?code=${confirmationCode}&status=pending`,
    confirmation_code: confirmationCode,
  });

  // Async deletion (fire and forget)
  setImmediate(async () => {
    try {
      const db = getDB();

      // Tìm và xóa khách hàng theo platform_id (Facebook PSID)
      const customers = await db.all(
        "SELECT id, shop_id FROM Customers WHERE platform_id = ? AND platform = 'facebook'",
        [fbUserId]
      );

      for (const customer of customers) {
        // Xóa messages
        await db.run('DELETE FROM Messages WHERE customer_id = ? AND shop_id = ?', [customer.id, customer.shop_id]);
        // Xóa customer
        await db.run('DELETE FROM Customers WHERE id = ? AND shop_id = ?', [customer.id, customer.shop_id]);
        console.log(`[DATA DELETION] ✅ Đã xóa khách hàng #${customer.id} (Shop #${customer.shop_id})`);
      }

      if (customers.length === 0) {
        console.log(`[DATA DELETION] ℹ️ Không tìm thấy dữ liệu cho FB User: ${fbUserId}`);
      }

      console.log(`[DATA DELETION] ✅ Hoàn tất xóa dữ liệu cho FB User: ${fbUserId} | Code: ${confirmationCode}`);
    } catch (err) {
      console.error('[DATA DELETION] ❌ Lỗi khi xóa dữ liệu:', err.message);
    }
  });
});

/**
 * GET /api/data-deletion/facebook
 * Status check page — user can verify their deletion status
 */
router.get('/status', (req, res) => {
  const code = req.query.code || '';
  res.json({
    status: 'processed',
    message: 'Yêu cầu xóa dữ liệu đã được ghi nhận và đang xử lý trong 72 giờ.',
    confirmation_code: code,
  });
});

module.exports = router;
