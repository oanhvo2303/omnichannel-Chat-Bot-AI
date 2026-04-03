'use strict';

const dotenv = require('dotenv');
dotenv.config();

/**
 * Central configuration object.
 * All environment variables are accessed from here.
 */
const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  facebook: {
    verifyToken: process.env.FB_VERIFY_TOKEN,
    appId: process.env.FB_APP_ID,
    appSecret: process.env.FB_APP_SECRET,
    // pageAccessToken đã chuyển sang lưu trong DB theo từng Shop
  },
  // Prepared for Zalo OA integration
  zalo: {
    oaSecret: process.env.ZALO_OA_SECRET,
    oaAccessToken: process.env.ZALO_OA_ACCESS_TOKEN,
  },
  // Gemini AI (Agent B)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  // JWT Authentication
  jwt: {
    secret: process.env.JWT_SECRET || 'omnichannel-bot-default-secret-change-me',
    expiresIn: '7d',
  },
};

// ---- Startup Validation ----
// Fail fast: if critical secrets are missing, crash on startup rather than at runtime.
const requiredVars = ['FB_VERIFY_TOKEN', 'FB_APP_SECRET', 'GEMINI_API_KEY'];
const missingVars = requiredVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.error(`[CONFIG] FATAL: Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('[CONFIG] Please copy .env.example to .env and fill in the values.');
  process.exit(1);
}

module.exports = config;

