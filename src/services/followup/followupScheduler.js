'use strict';
/**
 * followupScheduler.js
 * ─────────────────────────────────────────────────────────────
 * Phase 1 — Initial Follow-up:
 *   Bot reply → khách im X phút → gửi 1 tin hỏi lại
 *
 * Phase 2 — Remarketing Cycle:
 *   Sau Phase 1 mà khách vẫn im → cứ 12–23h (tuỳ config) gửi
 *   1 tin từ pool mẫu, xoay vòng, đến khi khách reply hoặc
 *   đạt giới hạn (max N lần / N ngày).
 * ─────────────────────────────────────────────────────────────
 */
const { getDB } = require('../../infra/database/sqliteConnection');

let _isRunning = false;

// ─── Gửi tin qua Facebook Graph API ─────────────────────────
async function sendFacebookMessage(psid, pageToken, message, messageTag) {
  const body = {
    recipient: { id: psid },
    message: { text: message },
    messaging_type: 'MESSAGE_TAG',
    tag: messageTag || 'CONFIRMED_EVENT_UPDATE',
  };
  const response = await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err?.error?.message || 'Facebook API error');
  }
  return response.json();
}

// ─── Random số giờ giữa min và max ──────────────────────────
function randomHours(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Main scheduler logic ────────────────────────────────────
async function runFollowupCheck() {
  if (_isRunning) return;
  _isRunning = true;
  try {
    const db = getDB();

    // ═══════════════════════════════════════════════════
    // PHASE 1: Initial Follow-up
    // ═══════════════════════════════════════════════════
    const phase1Customers = await db.all(`
      SELECT c.id, c.platform_id, c.shop_id, c.page_id,
             s.followup_message, s.followup_delay_minutes,
             s.remarketing_enabled, s.remarketing_interval_min, s.remarketing_interval_max,
             i.access_token AS page_access_token
      FROM Customers c
      JOIN Shops s ON c.shop_id = s.id
      JOIN ShopIntegrations i ON i.shop_id = c.shop_id AND i.page_id = c.page_id
      WHERE s.followup_enabled = 1
        AND s.followup_message IS NOT NULL AND s.followup_message != ''
        AND c.last_bot_message_at IS NOT NULL
        AND c.followup_sent_at IS NULL
        AND c.is_ai_paused = 0
        AND i.access_token IS NOT NULL
        AND datetime(c.last_bot_message_at, '+' || s.followup_delay_minutes || ' minutes') <= datetime('now')
    `);

    for (const c of phase1Customers) {
      try {
        await sendFacebookMessage(c.platform_id, c.page_access_token, c.followup_message);
        const hours = randomHours(c.remarketing_interval_min || 12, c.remarketing_interval_max || 23);
        await db.run(`
          UPDATE Customers SET
            followup_sent_at = CURRENT_TIMESTAMP,
            remarketing_started_at = CURRENT_TIMESTAMP,
            remarketing_next_at = datetime('now', '+${hours} hours'),
            remarketing_cycle_index = 0
          WHERE id = ?
        `, [c.id]);
        console.log(`[FOLLOWUP] ✅ Phase1 → PSID ${c.platform_id} | Next cycle in ${hours}h`);
      } catch (err) {
        console.error(`[FOLLOWUP] ❌ Phase1 lỗi → PSID ${c.platform_id}:`, err.message);
        // Mark sent để tránh retry vô tận với lỗi permanent
        await db.run('UPDATE Customers SET followup_sent_at = CURRENT_TIMESTAMP WHERE id = ?', [c.id]);
      }
    }

    // ═══════════════════════════════════════════════════
    // PHASE 2: Remarketing Cycle
    // ═══════════════════════════════════════════════════
    const phase2Customers = await db.all(`
      SELECT c.id, c.platform_id, c.shop_id, c.page_id,
             c.remarketing_cycle_index,
             s.remarketing_templates, s.remarketing_max_cycles, s.remarketing_max_days,
             s.remarketing_interval_min, s.remarketing_interval_max,
             s.remarketing_message_tag,
             i.access_token AS page_access_token
      FROM Customers c
      JOIN Shops s ON c.shop_id = s.id
      JOIN ShopIntegrations i ON i.shop_id = c.shop_id AND i.page_id = c.page_id
      WHERE s.remarketing_enabled = 1
        AND s.remarketing_templates IS NOT NULL AND s.remarketing_templates != '[]'
        AND c.followup_sent_at IS NOT NULL
        AND c.remarketing_next_at IS NOT NULL
        AND c.remarketing_next_at <= datetime('now')
        AND c.remarketing_cycle_index < s.remarketing_max_cycles
        AND c.remarketing_started_at > datetime('now', '-' || s.remarketing_max_days || ' days')
        AND c.is_ai_paused = 0
        AND i.access_token IS NOT NULL
    `);

    if (phase2Customers.length > 0) {
      console.log(`[FOLLOWUP] 🔄 Phase2: ${phase2Customers.length} khách cần remarketing`);
    }

    for (const c of phase2Customers) {
      try {
        // Parse templates
        let templates = [];
        try { templates = JSON.parse(c.remarketing_templates || '[]'); } catch { templates = []; }
        if (!templates.length) continue;

        // Pick template theo vòng tròn
        const templateIndex = (c.remarketing_cycle_index || 0) % templates.length;
        const message = templates[templateIndex];
        if (!message?.trim()) continue;

        await sendFacebookMessage(c.platform_id, c.page_access_token, message, c.remarketing_message_tag);

        const hours = randomHours(c.remarketing_interval_min || 12, c.remarketing_interval_max || 23);
        const nextIdx = (c.remarketing_cycle_index || 0) + 1;
        await db.run(`
          UPDATE Customers SET
            remarketing_cycle_index = ?,
            remarketing_next_at = datetime('now', '+${hours} hours')
          WHERE id = ?
        `, [nextIdx, c.id]);

        console.log(`[FOLLOWUP] ✅ Phase2 cycle#${nextIdx} → PSID ${c.platform_id} | Template[${templateIndex}] | Next in ${hours}h`);
      } catch (err) {
        console.error(`[FOLLOWUP] ❌ Phase2 lỗi → PSID ${c.platform_id}:`, err.message);
        // Advance next_at để tránh retry liên tục với lỗi permanent
        const hours = randomHours(c.remarketing_interval_min || 12, c.remarketing_interval_max || 23);
        await db.run(`UPDATE Customers SET remarketing_next_at = datetime('now', '+${hours} hours') WHERE id = ?`, [c.id]);
      }
    }

  } catch (err) {
    console.error('[FOLLOWUP] ❌ Scheduler lỗi:', err.message);
  } finally {
    _isRunning = false;
  }
}

function startFollowupScheduler() {
  console.log('[FOLLOWUP] 🚀 Auto Follow-up Scheduler đã khởi động (interval: 60s)');
  setTimeout(runFollowupCheck, 30000);
  setInterval(runFollowupCheck, 60000);
}

module.exports = { startFollowupScheduler };
