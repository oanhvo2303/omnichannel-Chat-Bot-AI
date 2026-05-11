#!/bin/bash
set -e

# ============================================================
# 🚀 OMNICHANNEL BOT — ONE-CLICK DEPLOY SCRIPT
# Server: Google Cloud E2-Medium (Ubuntu 22.04)
# ============================================================

echo "═══════════════════════════════════════════════════════"
echo "🚀 OMNICHANNEL BOT — BẮT ĐẦU CÀI ĐẶT TỰ ĐỘNG"
echo "═══════════════════════════════════════════════════════"

# ---- Step 1: Cập nhật hệ thống ----
echo ""
echo "📦 [1/7] Cập nhật hệ thống..."
sudo apt update && sudo apt upgrade -y

# ---- Step 2: Cài Node.js 20 LTS ----
echo ""
echo "📦 [2/7] Cài đặt Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
echo "   ✅ Node.js $(node -v) | npm $(npm -v)"

# ---- Step 3: Cài công cụ cần thiết ----
echo ""
echo "📦 [3/7] Cài Git, PM2, Nginx..."
sudo apt install -y git nginx
sudo npm install -g pm2
echo "   ✅ PM2 $(pm2 -v) | Git $(git --version | awk '{print $3}')"

# ---- Step 4: Clone source code ----
echo ""
echo "📦 [4/7] Clone source code..."
cd /home
if [ -d "omnichannel-bot" ]; then
  echo "   ⚠️  Thư mục đã tồn tại, pull code mới nhất..."
  cd omnichannel-bot && git pull
else
  echo "   ℹ️  Chưa có source. Sẽ upload thủ công ở bước sau."
  sudo mkdir -p omnichannel-bot
  cd omnichannel-bot
fi

# ---- Step 5: Cài dependencies ----
echo ""
echo "📦 [5/7] Cài dependencies..."
if [ -f "package.json" ]; then
  npm install --production
  echo "   ✅ Backend dependencies đã cài"
fi

if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
  cd frontend
  npm install
  npm run build
  cd ..
  echo "   ✅ Frontend đã build xong"
fi

# ---- Step 6: Cấu hình Nginx Reverse Proxy ----
echo ""
echo "📦 [6/7] Cấu hình Nginx..."
sudo tee /etc/nginx/sites-available/omnichannel > /dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API + Socket.IO
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Webhook Facebook
    location /webhook/ {
        proxy_pass http://127.0.0.1:3001/webhook/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/omnichannel /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
echo "   ✅ Nginx đã cấu hình & restart"

# ---- Step 7: Khởi động với PM2 ----
echo ""
echo "📦 [7/7] Khởi động ứng dụng với PM2..."
if [ -f "package.json" ]; then
  pm2 delete all 2>/dev/null || true
  
  # Backend — chạy server.js (entry point thật, có http.listen)
  pm2 start server.js --name "omni-backend" --env production
  
  # Frontend
  if [ -d "frontend/.next" ]; then
    cd frontend
    pm2 start npm --name "omni-frontend" -- start -- -p 3002
    cd ..
  fi
  
  pm2 save
  pm2 startup | tail -1 | bash 2>/dev/null || true
  echo "   ✅ PM2 đã khởi động & lưu cấu hình auto-restart"
fi

# ---- HOÀN TẤT ----
echo ""
echo "═══════════════════════════════════════════════════════"
echo "🎉 CÀI ĐẶT HOÀN TẤT!"
echo "═══════════════════════════════════════════════════════"
echo ""
EXTERNAL_IP=$(curl -s http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google" 2>/dev/null || echo "YOUR_IP")
echo "   🌐 Truy cập: http://${EXTERNAL_IP}"
echo "   📡 Webhook:  http://${EXTERNAL_IP}/webhook/facebook"
echo ""
echo "   📋 Lệnh kiểm tra:"
echo "      pm2 status        — Xem trạng thái"
echo "      pm2 logs          — Xem log real-time"
echo "      pm2 restart all   — Restart toàn bộ"
echo ""
echo "═══════════════════════════════════════════════════════"
