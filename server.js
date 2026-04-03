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
  const io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:3002', 'http://127.0.0.1:3002'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Lưu instance io vào singleton để controller dùng
  setIO(io);

  // Middleware bảo mật: Bắt buộc Socket.IO phải gửi JWT lên
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error: Missing token'));

    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, config.jwt.secret);
      socket.shopId = decoded.shopId;
      next();
    } catch (err) {
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

          console.log('\n=======================================================');
          console.log(`🚀 [LINK WEBHOOK DÀNH CHO FACEBOOK (NGROK)]`);
          console.log(`   ${listener.url()}/webhook/facebook`);
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
