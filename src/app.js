'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

// --- Route Imports ---
const facebookRoutes = require('./api/routes/facebook.routes');
const zaloRoutes = require('./api/routes/zalo.routes');
const instagramRoutes = require('./api/routes/instagram.routes');
const apiRoutes = require('./api/routes/api.routes');
const authRoutes = require('./api/routes/auth.routes');
const oauthRoutes = require('./api/routes/oauth.routes');
const tagsRoutes = require('./api/routes/tags.routes');
const ordersRoutes = require('./api/routes/orders.routes');
const quickRepliesRoutes = require('./api/routes/quickReplies.routes');
const productsRoutes = require('./api/routes/products.routes');
const analyticsRoutes = require('./api/routes/analytics.routes');
const staffRoutes = require('./api/routes/staff.routes');
const broadcastRoutes = require('./api/routes/broadcast.routes');
const marketplaceRoutes = require('./api/routes/marketplace.routes');
const botRulesRoutes = require('./api/routes/botRules.routes');
const commentRulesRoutes = require('./api/routes/commentRules.routes');
const pagesRoutes = require('./api/routes/pages.routes');
const integrationsRoutes = require('./api/routes/integrations.routes');
const trackingRoutes = require('./api/routes/tracking.routes');
const remarketingRoutes = require('./api/routes/remarketing.routes');
const uploadRoutes = require('./api/routes/upload.routes');
const adminRoutes = require('./api/routes/admin.routes');
const aiSettingsRoutes = require('./api/routes/aiSettings.routes');
const dataDeletionRoutes = require('./api/routes/dataDeletion.routes');
const followupRoutes = require('./api/routes/followup.routes'); // FIX: mount followup
const faqRoutes = require('./api/routes/faq.routes');             // FAQ / AI training data

/**
 * Creates and configures the Express application instance.
 * This factory pattern makes the app independently testable
 * without binding it to a network port.
 */
const createApp = () => {
  const app = express();

  // =============================================
  // Global Middleware
  // =============================================

  // CORS — cho phép Frontend gọi API từ mọi môi trường
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://pgquangngai.io.vn',
    'https://pgquangngai.io.vn',
    'http://206.168.191.117:25402',
  ];
  app.use(cors({
    origin: (origin, callback) => {
      // Cho phép requests không có origin (server-to-server, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin ${origin} không được phép.`));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }));

  /**
   * Raw Body Capture for HMAC Signature Verification.
   *
   * CRITICAL: This must be placed BEFORE express.json().
   * Facebook's signature is computed against the raw request body bytes.
   * If we parse JSON first, we lose access to the original byte stream.
   *
   * The `verify` callback attaches the raw buffer to `req.rawBody`
   * so our security middleware can use it for HMAC comparison.
   */
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(express.urlencoded({ extended: true }));

  // Static: phục vụ file ảnh đã upload (bot_media)
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // =============================================
  // Routes
  // =============================================
  app.use('/webhook/facebook', facebookRoutes);
  app.use('/webhook/zalo', zaloRoutes);
  app.use('/webhook/instagram', instagramRoutes);
  app.use('/api/auth', authRoutes);       // Public: đăng ký/đăng nhập (TRƯỚC /api)
  app.use('/api/oauth', oauthRoutes);     // OAuth flow
  app.use('/api/tags', tagsRoutes);       // Tags CRUD (protected bên trong)
  app.use('/api/orders', ordersRoutes);   // Orders (protected bên trong)
  app.use('/api/quick-replies', quickRepliesRoutes); // Quick Replies
  app.use('/api/products', productsRoutes);           // Products (kho hang)
  app.use('/api/analytics', analyticsRoutes);         // Analytics/stats
  app.use('/api/staff', staffRoutes);                  // Staff management
  app.use('/api/broadcasts', broadcastRoutes);          // Broadcast campaigns
  app.use('/api/marketplace', marketplaceRoutes);        // Shopee + TikTok OAuth
  app.use('/api/bot-rules', botRulesRoutes);              // Keyword bot rules
  app.use('/api/comment-rules', commentRulesRoutes);      // Auto-reply comment rules
  app.use('/api/pages', pagesRoutes);                      // Multi-page management
  app.use('/api/integrations', integrationsRoutes);          // Shop integrations CRUD
  app.use('/api/tracking', trackingRoutes);
  app.use('/api/remarketing', remarketingRoutes);              // Re-marketing campaigns
  app.use('/api/upload', uploadRoutes);                          // Image upload
  app.use('/api/admin', adminRoutes);                            // Nền tảng SaaS (SUPER_ADMIN)
  app.use('/api/settings/ai', aiSettingsRoutes);                    // AI Settings per Shop
  app.use('/api/data-deletion', dataDeletionRoutes);               // Facebook Data Deletion Callback (GDPR)
  app.use('/api/followup', followupRoutes);                          // FIX: Follow-up campaigns
  app.use('/api/faq', faqRoutes);                                    // FAQ / AI training data
  app.use('/api', apiRoutes);             // Protected: cần JWT


  // Placeholder for future Zalo OA webhook (Phase 2)
  // app.use('/webhook/zalo', zaloRoutes);

  // =============================================
  // Health Check
  // =============================================
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'OK',
      service: 'omnichannel-bot',
      timestamp: new Date().toISOString(),
    });
  });

  // =============================================
  // 404 Handler
  // =============================================
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found: The requested endpoint does not exist.' });
  });

  // =============================================
  // Global Error Handler
  // =============================================
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[ERROR]', err.stack);
    res.status(500).json({ error: 'Internal Server Error.' });
  });

  return app;
};

module.exports = createApp;
