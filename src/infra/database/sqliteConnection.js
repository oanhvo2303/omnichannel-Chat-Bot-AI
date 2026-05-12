'use strict';

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let dbInstance = null;

/**
 * Khởi tạo kết nối SQLite và tự động tạo bảng Multi-tenant.
 */
const initSQLite = async () => {
  try {
    const dbPath = path.join(__dirname, '../../../database.sqlite');

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    console.log(`[DATABASE] Đã kết nối SQLite cục bộ.`);

    // Bật khóa ngoại (Foreign Keys)
    await db.exec('PRAGMA foreign_keys = ON;');

    // =============================================
    // Bảng Shops (Chủ shop / Tenant)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Shops (
        id                        INTEGER PRIMARY KEY AUTOINCREMENT,
        email                     TEXT NOT NULL UNIQUE,
        password_hash             TEXT NOT NULL,
        shop_name                 TEXT,
        role                      TEXT DEFAULT 'SHOP_OWNER',
        is_active                 INTEGER DEFAULT 0,
        subscription_plan         TEXT DEFAULT 'FREE',
        facebook_page_id          TEXT,
        page_access_token         TEXT,
        zalo_oa_id                TEXT,
        zalo_access_token         TEXT,
        instagram_account_id      TEXT,
        instagram_access_token    TEXT,
        shopee_shop_id            TEXT,
        shopee_access_token       TEXT,
        shopee_refresh_token      TEXT,
        tiktok_shop_id            TEXT,
        tiktok_access_token       TEXT,
        tiktok_refresh_token      TEXT,
        created_at                DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Migrations cho bảng Shops (nếu đã tồn tại)
    try { await db.exec("ALTER TABLE Shops ADD COLUMN role TEXT DEFAULT 'SHOP_OWNER'"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN is_active INTEGER DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN subscription_plan TEXT DEFAULT 'FREE'"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN account_status TEXT DEFAULT 'active' CHECK(account_status IN ('active', 'banned', 'trial'))"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN auto_assign_staff INTEGER DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN default_shipping_fee INTEGER NOT NULL DEFAULT 30000"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN free_shipping_threshold INTEGER NOT NULL DEFAULT 500000"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN free_shipping_min_quantity INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }

    // ═══ SaaS License Management ═══
    try { await db.exec("ALTER TABLE Shops ADD COLUMN license_status TEXT DEFAULT 'ACTIVE'"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN license_expires_at DATETIME"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN ai_quota_limit INTEGER DEFAULT 1000"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN ai_messages_used INTEGER DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN gemini_api_key TEXT"); } catch { /* exists */ }
    // ═══ Auto Follow-up Settings ═══
    try { await db.exec("ALTER TABLE Shops ADD COLUMN followup_enabled INTEGER DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN followup_delay_minutes INTEGER DEFAULT 10"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN followup_message TEXT"); } catch { /* exists */ }
    // ═══ Remarketing Cycle Settings ═══
    try { await db.exec("ALTER TABLE Shops ADD COLUMN remarketing_enabled INTEGER DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN remarketing_interval_min INTEGER DEFAULT 12"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN remarketing_interval_max INTEGER DEFAULT 23"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN remarketing_templates TEXT"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN remarketing_max_cycles INTEGER DEFAULT 30"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN remarketing_max_days INTEGER DEFAULT 30"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Shops ADD COLUMN remarketing_message_tag TEXT DEFAULT 'CONFIRMED_EVENT_UPDATE'"); } catch { /* exists */ }

    // Migrate: account_status → license_status (one-time sync for existing data)
    await db.exec("UPDATE Shops SET license_status = 'SUSPENDED' WHERE account_status = 'banned' AND license_status = 'ACTIVE'");
    await db.exec("UPDATE Shops SET license_status = 'TRIAL' WHERE account_status = 'trial' AND license_status = 'ACTIVE'");

    // Seed: Nâng cấp ông chủ đầu tiên thành SUPER_ADMIN (Nếu có)
    await db.exec("UPDATE Shops SET role = 'SUPER_ADMIN' WHERE id = 1 AND role != 'SUPER_ADMIN'");

    // =============================================
    // Bảng Pages (Đa Fanpage cho 1 Shop)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Pages (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id           INTEGER NOT NULL,
        page_id           TEXT NOT NULL,
        page_name         TEXT,
        page_access_token TEXT NOT NULL,
        platform          TEXT DEFAULT 'facebook',
        is_active         INTEGER DEFAULT 1,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE,
        UNIQUE(shop_id, page_id)
      );
    `);

    // =============================================
    // Bảng Staff (Nhân viên thuộc Shop)
    // Roles: owner, admin, staff
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Staff (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id       INTEGER NOT NULL,
        email         TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        name          TEXT,
        role          TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('owner', 'admin', 'staff')),
        is_online     INTEGER DEFAULT 0,
        last_assigned_at DATETIME,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE,
        UNIQUE(shop_id, email)
      );
    `);
    try { await db.exec("ALTER TABLE Staff ADD COLUMN last_assigned_at DATETIME"); } catch { /* exists */ }
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_staff_routing ON Staff(shop_id, is_online, last_assigned_at);`);

    // =============================================
    // Bảng Customers (thuộc về 1 Shop)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Customers (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id        INTEGER NOT NULL,
        platform_id    TEXT NOT NULL,
        platform       TEXT DEFAULT 'facebook',
        name           TEXT,
        avatar_url     TEXT,
        phone          TEXT,
        address        TEXT,
        internal_note  TEXT,
        is_ai_paused   INTEGER DEFAULT 0,
        assigned_to    INTEGER,
        page_id        TEXT,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_to) REFERENCES Staff(id) ON DELETE SET NULL,
        UNIQUE(shop_id, platform_id, platform)
      );
    `);
    try { await db.exec("ALTER TABLE Customers ADD COLUMN avatar_url TEXT"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Customers ADD COLUMN internal_note TEXT"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Customers ADD COLUMN is_ai_paused INTEGER DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Customers ADD COLUMN last_bot_message_at DATETIME"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Customers ADD COLUMN followup_sent_at DATETIME"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Customers ADD COLUMN remarketing_next_at DATETIME"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Customers ADD COLUMN remarketing_cycle_index INTEGER DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Customers ADD COLUMN remarketing_started_at DATETIME"); } catch { /* exists */ }
    // Escalation tracking: ghi lại khi AI chuyển nhân viên (không khoá AI vĩnh viễn)
    try { await db.exec("ALTER TABLE Customers ADD COLUMN needs_human_at DATETIME"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Customers ADD COLUMN escalation_reason TEXT"); } catch { /* exists */ }
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_customer_needs_human ON Customers(shop_id, needs_human_at) WHERE needs_human_at IS NOT NULL;`).catch(() => {});


    // =============================================
    // Bảng Messages (thuộc về 1 Shop — denormalized)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id     INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        sender      TEXT NOT NULL CHECK(sender IN ('customer', 'bot')),
        sender_type TEXT DEFAULT 'customer',
        text        TEXT NOT NULL,
        intent      TEXT,
        type        TEXT NOT NULL DEFAULT 'inbox' CHECK(type IN ('inbox', 'comment')),
        comment_id  TEXT,
        post_id     TEXT,
        is_hidden   INTEGER DEFAULT 0,
        is_internal INTEGER DEFAULT 0,
        page_id     TEXT,
        timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES Customers(id) ON DELETE CASCADE
      );
    `);
    try { await db.exec("ALTER TABLE Messages ADD COLUMN sender_type TEXT DEFAULT 'customer'"); } catch { /* exists */ }

    // =============================================
    // Indexes
    // =============================================
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_customer_shop ON Customers(shop_id);
      CREATE INDEX IF NOT EXISTS idx_customer_platform ON Customers(shop_id, platform_id, platform);
      CREATE INDEX IF NOT EXISTS idx_message_customer_time ON Messages(customer_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_message_shop ON Messages(shop_id);
      CREATE INDEX IF NOT EXISTS idx_shop_page_id ON Shops(facebook_page_id);
    `);

    // =============================================
    // Bảng Tags (Thẻ gắn khách hàng)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Tags (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id  INTEGER NOT NULL,
        name     TEXT NOT NULL,
        color    TEXT NOT NULL DEFAULT '#3B82F6',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE,
        UNIQUE(shop_id, name)
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS CustomerTags (
        customer_id INTEGER NOT NULL,
        tag_id      INTEGER NOT NULL,
        PRIMARY KEY (customer_id, tag_id),
        FOREIGN KEY (customer_id) REFERENCES Customers(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES Tags(id) ON DELETE CASCADE
      );
    `);

    // =============================================
    // Bảng BotRules (Kịch bản từ khóa)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS BotRules (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id       INTEGER NOT NULL,
        keywords      TEXT NOT NULL,
        response      TEXT NOT NULL,
        response_type TEXT DEFAULT 'text' CHECK(response_type IN ('text','image')),
        media_url     TEXT,
        is_active     INTEGER DEFAULT 1,
        match_type    TEXT DEFAULT 'contains' CHECK(match_type IN ('contains','exact','startswith')),
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE
      );
    `);
    // Migration: thêm cột mới nếu chưa có (cho DB cũ)
    try { await db.exec("ALTER TABLE BotRules ADD COLUMN response_type TEXT DEFAULT 'text'"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE BotRules ADD COLUMN media_url TEXT"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE BotRules ADD COLUMN steps TEXT DEFAULT NULL"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE BotRules ADD COLUMN integration_id INTEGER DEFAULT NULL"); } catch { /* exists */ }

    // =============================================
    // Bảng CommentRules (Auto-reply Comment)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS CommentRules (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id           INTEGER NOT NULL,
        post_id           TEXT DEFAULT 'ALL',
        trigger_keywords  TEXT DEFAULT NULL,
        reply_text        TEXT,
        inbox_text        TEXT,
        auto_hide         INTEGER DEFAULT 1,
        is_active         INTEGER DEFAULT 1,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE
      );
    `);

    // =============================================
    // Bảng Orders & OrderItems (Đơn hàng)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Orders (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id              INTEGER NOT NULL,
        customer_id          INTEGER,
        created_by_id        INTEGER,
        total_amount         REAL NOT NULL DEFAULT 0,
        status               TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','shipping','completed','cancelled','returned')),
        tracking_code        TEXT,
        shipping_provider    TEXT,
        shipping_status      TEXT,
        shipped_at           DATETIME,
        marketplace_source   TEXT CHECK(marketplace_source IN ('internal','shopee','tiktok')),
        marketplace_order_id TEXT,
        marketplace_status   TEXT,
        note                 TEXT,
        created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES Customers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_id) REFERENCES Staff(id) ON DELETE SET NULL
      );
    `);
    try { await db.exec("ALTER TABLE Orders ADD COLUMN created_by_id INTEGER REFERENCES Staff(id) ON DELETE SET NULL"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Orders ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Orders ADD COLUMN subtotal INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Orders ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Orders ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'FIXED' CHECK(discount_type IN ('FIXED','PERCENT'))"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Orders ADD COLUMN recipient_name TEXT"); } catch { /* exists */ }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS OrderItems (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id   INTEGER NOT NULL,
        product_id INTEGER,
        name       TEXT NOT NULL,
        quantity   INTEGER NOT NULL DEFAULT 1,
        price      REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE SET NULL
      );
    `);
    try { await db.exec("ALTER TABLE OrderItems ADD COLUMN product_id INTEGER"); } catch { /* exists */ }

    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tags_shop ON Tags(shop_id);
      CREATE INDEX IF NOT EXISTS idx_customer_tags ON CustomerTags(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_shop ON Orders(shop_id);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON Orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_tracking ON Orders(tracking_code);
      CREATE INDEX IF NOT EXISTS idx_customer_psid ON Customers(platform_id);
    `);

    // =============================================
    // Bảng QuickReplies (Tin nhắn mẫu)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS QuickReplies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL,
        shortcut TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE,
        UNIQUE(shop_id, shortcut)
      );
    `);
    
    // Thêm cột image_url nếu DB đã có bảng từ trước
    try { await db.exec("ALTER TABLE QuickReplies ADD COLUMN image_url TEXT"); } catch { /* exists */ }

    await db.exec(`CREATE INDEX IF NOT EXISTS idx_quickreplies_shop ON QuickReplies(shop_id);`);

    // =============================================
    // Bảng MediaLibrary (Thư viện ảnh/video upload)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS MediaLibrary (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id    INTEGER NOT NULL,
        filename   TEXT NOT NULL,
        url        TEXT NOT NULL,
        mimetype   TEXT NOT NULL DEFAULT 'image/jpeg',
        size       INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE
      );
    `);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_medialibrary_shop ON MediaLibrary(shop_id, created_at DESC);`);

    console.log('[DB] ✅ SQLite schemas are ready.');


    // =============================================
    // Bảng Broadcasts (Chiến dịch gửi tin hàng loạt)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Broadcasts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id      INTEGER NOT NULL,
        name         TEXT NOT NULL,
        message      TEXT NOT NULL,
        image_url    TEXT,
        tag_ids      TEXT,
        status       TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sending','completed','failed')),
        total        INTEGER DEFAULT 0,
        sent         INTEGER DEFAULT 0,
        failed       INTEGER DEFAULT 0,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS BroadcastLogs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        broadcast_id INTEGER NOT NULL,
        customer_id  INTEGER NOT NULL,
        platform_id  TEXT NOT NULL,
        status       TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
        error        TEXT,
        sent_at      DATETIME,
        FOREIGN KEY (broadcast_id) REFERENCES Broadcasts(id) ON DELETE CASCADE
      );
    `);

    // =============================================
    // Bảng Products (Kho hàng)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Products (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id        INTEGER NOT NULL,
        name           TEXT NOT NULL,
        sku            TEXT,
        price          REAL NOT NULL DEFAULT 0,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        image_url      TEXT,
        description    TEXT,
        attributes     TEXT,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE
      );
    `);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_products_shop ON Products(shop_id);`);
    try { await db.exec("ALTER TABLE Products ADD COLUMN volume_pricing TEXT"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Products ADD COLUMN description TEXT"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Products ADD COLUMN attributes TEXT"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE Products ADD COLUMN images TEXT"); } catch { /* exists */ }


    // [QA] Duplicate QuickReplies đã được xóa — bảng đã tạo ở dòng 265

    // =============================================
    // Bảng ShopIntegrations (Kênh tích hợp)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ShopIntegrations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id         INTEGER NOT NULL,
        platform        TEXT NOT NULL,
        access_token    TEXT,
        refresh_token   TEXT,
        page_name       TEXT,
        page_id         TEXT,
        metadata        TEXT,
        status          TEXT NOT NULL DEFAULT 'disconnected',
        is_ai_active    INTEGER DEFAULT 0,
        ai_system_prompt TEXT,
        auto_hide_comments TEXT DEFAULT 'none',
        connected_at    DATETIME,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE,
        UNIQUE(shop_id, platform)
      );
    `);
    try { await db.exec("ALTER TABLE ShopIntegrations ADD COLUMN is_ai_active INTEGER DEFAULT 0"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE ShopIntegrations ADD COLUMN ai_system_prompt TEXT"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE ShopIntegrations ADD COLUMN auto_hide_comments TEXT DEFAULT 'none'"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE ShopIntegrations ADD COLUMN bot_rules_mode TEXT DEFAULT 'keyword'"); } catch { /* exists */ }
    try { await db.exec("ALTER TABLE ShopIntegrations ADD COLUMN ai_full_history INTEGER DEFAULT 0"); } catch { /* exists */ }

    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_integrations_shop ON ShopIntegrations(shop_id);
      CREATE INDEX IF NOT EXISTS idx_integrations_page_id ON ShopIntegrations(page_id);
    `);

    // =============================================
    // Bảng ShopTracking (Pixel & CAPI)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ShopTracking (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id         INTEGER NOT NULL,
        pixel_id        TEXT,
        capi_token      TEXT,
        test_event_code TEXT,
        is_active       INTEGER NOT NULL DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE,
        UNIQUE(shop_id)
      );
    `);

    await db.exec(`CREATE INDEX IF NOT EXISTS idx_tracking_shop ON ShopTracking(shop_id);`);

    // =============================================
    // Bảng FAQ (Dữ liệu huấn luyện AI / Câu hỏi thường gặp)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS FAQ (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id         INTEGER NOT NULL,
        question        TEXT NOT NULL,
        answer          TEXT NOT NULL,
        category        TEXT,
        integration_ids TEXT,              -- JSON array of ShopIntegration IDs (null = áp dụng tất cả trang)
        is_active       INTEGER NOT NULL DEFAULT 1,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE
      );
    `);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_faq_shop ON FAQ(shop_id, is_active);`);

    // =============================================
    // Bảng AuditLogs (Nhật ký hành động Admin)
    // Ghi lại mọi thay đổi quan trọng để debug + compliance
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS AuditLogs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id     INTEGER NOT NULL,
        actor_id    INTEGER,               -- staffId (null nếu shop owner)
        actor_role  TEXT,                  -- role tại thời điểm hành động
        action      TEXT NOT NULL,         -- VD: 'UPDATE_BOT_RULE', 'SEND_BROADCAST', 'DELETE_PRODUCT'
        resource    TEXT,                  -- VD: 'BotRules', 'Orders', 'Staff'
        resource_id TEXT,                  -- ID của record bị thay đổi
        detail      TEXT,                  -- JSON snapshot hoặc mô tả ngắn
        ip          TEXT,                  -- IP của request
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE
      );
    `);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_shop ON AuditLogs(shop_id, created_at DESC);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_actor ON AuditLogs(actor_id);`);

    // =============================================
    // Bảng Jobs — Persistent Queue (broadcast/remarketing/followup)
    // =============================================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS Jobs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id      INTEGER NOT NULL,
        type         TEXT NOT NULL,              -- 'broadcast' | 'remarketing' | 'followup'
        status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'done' | 'failed'
        payload      TEXT NOT NULL,             -- JSON payload
        attempts     INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        run_after    DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at   DATETIME,
        completed_at DATETIME,
        error        TEXT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES Shops(id) ON DELETE CASCADE
      );
    `);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_pending ON Jobs(status, run_after) WHERE status = 'pending';`);

    // ── Chạy versioned migrations (ALTER TABLE, index, v.v.) ──
    const { runMigrations } = require('./migrations');
    await runMigrations(db);

    console.log('[DATABASE] Cấu trúc bảng đã được đồng bộ.');

    dbInstance = db;
    return db;
  } catch (error) {
    console.error('[DATABASE] FATAL: Lỗi khởi tạo SQLite:', error.message);
    process.exit(1);
  }
};

const getDB = () => {
  if (!dbInstance) {
    throw new Error('Database chưa được khởi tạo. Hãy gọi initSQLite() trước.');
  }
  return dbInstance;
};

module.exports = { initSQLite, getDB };
