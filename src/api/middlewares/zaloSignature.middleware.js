'use strict';

const crypto = require('crypto');

/**
 * Zalo OA Webhook Signature Verification Middleware
 *
 * Zalo OA gửi header `mac` hoặc `x-zalo-signature` chứa HMAC-SHA256
 * của raw body, ký bằng OA Secret key.
 *
 * Docs: https://developers.zalo.me/docs/oa/webhook/verify-webhook
 *
 * Env required: ZALO_OA_SECRET
 *
 * QUAN TRỌNG: Middleware này yêu cầu req.rawBody (Buffer) được capture
 * trước khi JSON.parse. Đảm bảo app.js đã cấu hình rawBody verify.
 */
const verifyZaloSignature = (req, res, next) => {
  const secret = process.env.ZALO_OA_SECRET;

  // Nếu chưa cấu hình secret (dev/staging chưa kết nối Zalo thật),
  // log cảnh báo và cho pass — KHÔNG silent skip trong production.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[SECURITY] ZALO_OA_SECRET chưa được cấu hình. Từ chối request.');
      return res.status(403).json({ error: 'Forbidden: Zalo signature verification not configured.' });
    }
    console.warn('[SECURITY] ⚠️ ZALO_OA_SECRET chưa set — bỏ qua verify (chỉ cho phép trong dev).');
    return next();
  }

  // Zalo gửi MAC trong header 'x-zalo-signature' hoặc field 'mac' trong body.
  // Header được ưu tiên; nếu không có, thử lấy từ query string (Zalo event webhook v2).
  const signature = req.headers['x-zalo-signature'] || req.query.mac;

  if (!signature) {
    console.warn('[SECURITY] Zalo webhook: Thiếu chữ ký (x-zalo-signature / mac). Request bị từ chối.');
    return res.status(403).json({ error: 'Forbidden: Missing Zalo signature.' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    console.error('[SECURITY] req.rawBody không có — kiểm tra cấu hình verify trong app.js.');
    return res.status(500).json({ error: 'Internal Server Error: Raw body not available.' });
  }

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe compare
  const sigBuf      = Buffer.from(signature,   'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  const isValid =
    sigBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(sigBuf, expectedBuf);

  if (!isValid) {
    console.warn('[SECURITY] Zalo webhook: Chữ ký không hợp lệ. Request bị từ chối.');
    return res.status(403).json({ error: 'Forbidden: Invalid Zalo signature.' });
  }

  console.log('[SECURITY] Zalo webhook signature verified.');
  next();
};

module.exports = { verifyZaloSignature };
