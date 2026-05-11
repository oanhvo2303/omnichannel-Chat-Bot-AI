'use strict';

/**
 * server.js — Application Entry Point (Bootstrapper)
 *
 * Responsibilities:
 *  1. Load the Express app from src/app.js
 *  2. Bind the HTTP server to a port
 *  3. Handle startup errors and graceful shutdown signals
 *
 * This file is intentionally kept minimal. Business logic lives in src/.
 */

const http = require('http');
const { Server } = require('socket.io');
const createApp = require('./src/app');
const config = require('./src/config');
const { initSQLite } = require('./src/infra/database/sqliteConnection');
const { setIO } = require('./src/infra/socket/socketManager');

const app = createApp();
const PORT = config.server.port;

/**
 * Bootstrap: Init SQLite → Init Socket.IO → Start HTTP server.
 */
const bootstrap = async () => {
  await initSQLite();

  // Tạo HTTP server từ Express app (cần cho Socket.IO)
  const httpServer = http.createServer(app);

  // Khởi tạo Socket.IO với CORS cho Frontend
  // CORS_ORIGIN env var cho phép config linh hoạt theo môi trường
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : [
        'http://localhost:3002',
        'http://127.0.0.1:3002',
        'http://pgquangngai.io.vn',
        'https://pgquangngai.io.vn',
        'http://www.pgquangngai.io.vn',
        'https://www.pgquangngai.io.vn',
      ];

  console.log(`[SOCKET] Allowed CORS origins: ${allowedOrigins.join(', ')}`);

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Tăng pingTimeout để tránh disconnect giả trên production (slow network)
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Lưu instance io vào singleton để controller dùng
  setIO(io);

  // Middleware bảo mật: Bắt buộc Socket.IO phải gửi JWT và kiểm tra trạng thái account
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error: Missing token'));

    try {
      const jwt     = require('jsonwebtoken');
      const decoded = jwt.verify(token, config.jwt.secret);

      // FIX: Kiểm tra license/account_status từ DB
      // JWT có thể vẫn hợp lệ dù account đã bị khóa sau khi token được phát hành
      const { getDB } = require('./src/infra/database/sqliteConnection');
      const db       = getDB();
      const shop     = await db.get(
        'SELECT account_status, license_status FROM Shops WHERE id = ?',
        [decoded.shopId]
      );

      if (!shop) {
        return next(new Error('Authentication error: Shop not found'));
      }

      if (shop.account_status === 'banned' || shop.license_status === 'SUSPENDED') {
        console.warn(`[SOCKET] Kết nối bị từ chối: Shop #${decoded.shopId} bị SUSPENDED/banned.`);
        return next(new Error('Account suspended: Realtime connection not allowed'));
      }

      if (shop.license_status === 'EXPIRED') {
        console.warn(`[SOCKET] Kết nối bị từ chối: Shop #${decoded.shopId} license đã EXPIRED.`);
        return next(new Error('License expired: Realtime connection not allowed'));
      }

      socket.shopId = decoded.shopId;
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Token expired'));
      }
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Log kết nối/ngắt kết nối
  io.on('connection', (socket) => {
    console.log(`[SOCKET] Dashboard kết nối: ${socket.id} (Shop #${socket.shopId})`);
    
    // Đưa client vào Room ĐỘC LẬP mang tên shopId
    // Đây là lõi đa luồng (Multi-tenant), tránh rò rỉ tin nhắn chéo
    socket.join(String(socket.shopId));

    socket.on('disconnect', () => {
      console.log(`[SOCKET] Dashboard ngắt kết nối: ${socket.id} (Shop #${socket.shopId})`);
    });
  });

  // Lắng nghe bằng httpServer (KHÔNG phải app.listen)
  httpServer.listen(PORT, () => {
    console.log('=======================================================');
    console.log(`  omnichannel-bot is running`);
    console.log(`  Environment : ${config.server.nodeEnv}`);
    console.log(`  Port        : ${PORT}`);
    console.log(`  Health      : http://localhost:${PORT}/health`);
    console.log(`  FB Webhook  : http://localhost:${PORT}/webhook/facebook`);
    console.log(`  Socket.IO   : ws://localhost:${PORT}`);
    console.log(`  API         : http://localhost:${PORT}/api/customers`);
    console.log('=======================================================');

    // Start marketplace sync cron job
    const { startMarketplaceSync } = require('./src/api/services/marketplaceSyncService');
    startMarketplaceSync();

    // FIX: Start follow-up scheduler (gửi tin nhắn follow-up tự động)
    const { startFollowupScheduler } = require('./src/services/followup/followupScheduler');
    startFollowupScheduler();

    // 🗂️ Start persistent Job Queue Worker (broadcast/remarketing/followup)
    const { startWorker } = require('./src/services/queue/queueWorker');
    startWorker();

    // 🚀 Tự động đào hầm Ngrok ra Internet (Sử dụng Official SDK)
    if (config.server.nodeEnv === 'development') {
      const ngrok = require('@ngrok/ngrok');
      (async () => {
        try {
          // Bắt lỗi khi Sếp quên cài NGROK_AUTH_TOKEN ở .env (Để chống việc ngrok giới hạn băng thông/thời gian)
          if (!process.env.NGROK_AUTH_TOKEN) {
            console.log('\n=======================================================');
            console.log('⚠️ [CẢNH BÁO NGROK]: Chức năng Tự Động Đào Hầm bị tạm ngưng.');
            console.log(' 👉 Sếp hãy lấy NGROK_AUTH_TOKEN tại https://dashboard.ngrok.com');
            console.log(' 👉 Dán vào file .env (VD: NGROK_AUTH_TOKEN=AbcD_1234) rồi chạy lại!');
            console.log('=======================================================\n');
            return;
          }

          const listener = await ngrok.forward({
            addr: parseInt(PORT, 10),
            authtoken: process.env.NGROK_AUTH_TOKEN
          });
          const ngrokUrl = listener.url();
          process.env.NGROK_URL = ngrokUrl; // Lưu để rewrite localhost media URLs

          console.log('\n=======================================================');
          console.log(`🚀 [LINK WEBHOOK DÀNH CHO FACEBOOK (NGROK)]`);
          console.log(`   ${ngrokUrl}/webhook/facebook`);
          console.log('=======================================================\n');
        } catch (err) {
          console.error('[TUNNEL] Lỗi tạo ngrok:', err.message);
        }
      })();
    }
  });

  return httpServer;
};

// Start the application
let server;
bootstrap()
  .then((s) => { server = s; })
  .catch((err) => {
    console.error('[SERVER] Bootstrap failed:', err.message);
    process.exit(1);
  });

// =============================================
// Graceful Shutdown
// =============================================
// Allows the server to finish processing in-flight requests before exiting.
// Essential for production environments (Docker, PM2, etc.)

const gracefulShutdown = (signal) => {
  console.log(`\n[SERVER] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[SERVER] All connections closed. Process exiting.');
    process.exit(0);
  });

  // Force exit if shutdown takes too long (10 seconds)
  setTimeout(() => {
    console.error('[SERVER] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unhandled promise rejections to prevent silent failures
process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});
