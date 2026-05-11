'use strict';

/**
 * DB Migration System — Versioned Schema Management
 *
 * Thay thế pattern ALTER TABLE ad-hoc trong sqliteConnection.js
 * bằng migrations có version, idempotent, log rõ ràng.
 *
 * Cách dùng:
 *   await runMigrations(db);
 *
 * Thêm migration mới:
 *   1. Thêm entry vào mảng MIGRATIONS phía dưới
 *   2. Tăng version (không được skip số)
 *   3. Migration phải idempotent (IF NOT EXISTS, try/catch)
 */

// ─── Migration registry ───────────────────────────────────────
const MIGRATIONS = [
  {
    version: 1,
    name: 'add_shop_license_columns',
    up: async (db) => {
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN license_status TEXT DEFAULT 'ACTIVE'");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN license_expires_at DATETIME");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN ai_quota_limit INTEGER DEFAULT 1000");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN ai_messages_used INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN gemini_api_key TEXT");
    },
  },
  {
    version: 2,
    name: 'add_shop_followup_columns',
    up: async (db) => {
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN followup_enabled INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN followup_delay_minutes INTEGER DEFAULT 10");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN followup_message TEXT");
    },
  },
  {
    version: 3,
    name: 'add_shop_remarketing_columns',
    up: async (db) => {
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN remarketing_enabled INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN remarketing_interval_min INTEGER DEFAULT 12");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN remarketing_interval_max INTEGER DEFAULT 23");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN remarketing_templates TEXT");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN remarketing_max_cycles INTEGER DEFAULT 30");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN remarketing_max_days INTEGER DEFAULT 30");
    },
  },
  {
    version: 4,
    name: 'add_shop_shipping_columns',
    up: async (db) => {
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN default_shipping_fee INTEGER NOT NULL DEFAULT 30000");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN free_shipping_threshold INTEGER NOT NULL DEFAULT 500000");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN free_shipping_min_quantity INTEGER NOT NULL DEFAULT 0");
      await tryAlter(db, "ALTER TABLE Shops ADD COLUMN auto_assign_staff INTEGER DEFAULT 0");
    },
  },
  {
    version: 5,
    name: 'add_staff_columns',
    up: async (db) => {
      await tryAlter(db, "ALTER TABLE Staff ADD COLUMN is_active INTEGER DEFAULT 1");
      await tryAlter(db, "ALTER TABLE Staff ADD COLUMN permissions TEXT");
    },
  },
  {
    version: 6,
    name: 'add_orders_ecommerce_columns',
    up: async (db) => {
      await tryAlter(db, "ALTER TABLE Orders ADD COLUMN subtotal INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE Orders ADD COLUMN shipping_fee INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE Orders ADD COLUMN discount_amount INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE Orders ADD COLUMN discount_type TEXT DEFAULT 'FIXED'");
      await tryAlter(db, "ALTER TABLE Orders ADD COLUMN recipient_name TEXT");
    },
  },
  {
    version: 7,
    name: 'add_integration_columns',
    up: async (db) => {
      await tryAlter(db, "ALTER TABLE ShopIntegrations ADD COLUMN ai_prompt TEXT");
      await tryAlter(db, "ALTER TABLE ShopIntegrations ADD COLUMN is_ai_active INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE ShopIntegrations ADD COLUMN auto_hide_after_reply INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE ShopIntegrations ADD COLUMN bot_rules_mode TEXT DEFAULT 'sequential'");
      await tryAlter(db, "ALTER TABLE ShopIntegrations ADD COLUMN full_history_context INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE ShopIntegrations ADD COLUMN page_name TEXT");
    },
  },
  {
    version: 8,
    name: 'add_broadcasts_columns',
    up: async (db) => {
      await tryAlter(db, "ALTER TABLE Broadcasts ADD COLUMN tag_ids TEXT");
      await tryAlter(db, "ALTER TABLE Broadcasts ADD COLUMN sent INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE Broadcasts ADD COLUMN failed INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE Broadcasts ADD COLUMN completed_at DATETIME");
    },
  },
  {
    version: 9,
    name: 'add_products_columns',
    up: async (db) => {
      await tryAlter(db, "ALTER TABLE Products ADD COLUMN sku TEXT");
      await tryAlter(db, "ALTER TABLE Products ADD COLUMN description TEXT");
      await tryAlter(db, "ALTER TABLE Products ADD COLUMN attributes TEXT");
      await tryAlter(db, "ALTER TABLE Products ADD COLUMN images TEXT");
      await tryAlter(db, "ALTER TABLE Products ADD COLUMN volume_pricing TEXT");
    },
  },
  {
    version: 10,
    name: 'create_jobs_index',
    up: async (db) => {
      // Jobs table đã được tạo trong initSQLite, chỉ cần ensure index
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_pending ON Jobs(status, run_after) WHERE status = 'pending'`).catch(() => {});
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_shop ON Jobs(shop_id, created_at DESC)`).catch(() => {});
    },
  },
  {
    version: 11,
    name: 'add_faq_updated_at_column',
    up: async (db) => {
      // FAQ.updated_at thiếu trên DB cũ tạo trước khi column này được thêm vào schema
      await tryAlter(db, "ALTER TABLE FAQ ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
      // Backfill: cập nhật updated_at = created_at cho các row cũ
      await db.exec("UPDATE FAQ SET updated_at = created_at WHERE updated_at IS NULL").catch(() => {});
    },
  },
];

// ─── Helper ───────────────────────────────────────────────────
async function tryAlter(db, sql) {
  try { await db.exec(sql); } catch { /* column already exists — safe to ignore */ }
}

// ─── Runner ───────────────────────────────────────────────────
async function runMigrations(db) {
  // Tạo bảng schema_migrations nếu chưa có
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Lấy danh sách version đã apply
  const applied = new Set(
    (await db.all('SELECT version FROM schema_migrations')).map(r => r.version)
  );

  let newCount = 0;
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    console.log(`[MIGRATION] Applying v${migration.version}: ${migration.name}...`);
    try {
      await migration.up(db);
      await db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [migration.version, migration.name]
      );
      console.log(`[MIGRATION] ✅ v${migration.version} applied`);
      newCount++;
    } catch (err) {
      console.error(`[MIGRATION] ❌ v${migration.version} FAILED:`, err.message);
      // Không dừng server — ghi log và tiếp tục
    }
  }

  if (newCount === 0) {
    console.log(`[MIGRATION] Schema up-to-date (${MIGRATIONS.length} migrations)`);
  } else {
    console.log(`[MIGRATION] Applied ${newCount} new migrations`);
  }
}

module.exports = { runMigrations };
