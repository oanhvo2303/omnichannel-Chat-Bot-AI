'use strict';

const crypto = require('crypto');
const config = require('../../config');

/**
 * Facebook Webhook Signature Verification Middleware
 *
 * Validates the X-Hub-Signature-256 header on every POST request
 * from Facebook to ensure the request actually originated from Meta.
 * Uses Node's built-in crypto module for performance and security.
 *
 * @see https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads
 */
const verifyFacebookSignature = (req, res, next) => {
  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    console.warn('[SECURITY] Missing X-Hub-Signature-256 header. Request rejected.');
    return res.status(403).json({ error: 'Forbidden: Missing signature header.' });
  }

  // The raw body buffer is required for HMAC comparison.
  // Note: Express must be configured with `verify` option to expose req.rawBody.
  const rawBody = req.rawBody;
  if (!rawBody) {
    console.error('[SECURITY] req.rawBody is undefined. Ensure raw body capture is configured in app.js.');
    return res.status(500).json({ error: 'Internal server error: Raw body not available.' });
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', config.facebook.appSecret)
      .update(rawBody)
      .digest('hex');

  // Use timingSafeEqual to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    console.warn('[SECURITY] Invalid Facebook signature. Request rejected.');
    return res.status(403).json({ error: 'Forbidden: Invalid signature.' });
  }

  console.log('[SECURITY] Facebook signature verified successfully.');
  next();
};

module.exports = { verifyFacebookSignature };
