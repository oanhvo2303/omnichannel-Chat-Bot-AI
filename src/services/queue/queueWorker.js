'use strict';

/**
 * QueueWorker — SQLite-backed persistent job queue
 *
 * Thay thế fire-and-forget pattern:
 *  - Jobs survive server restart
 *  - Atomic claim (UPDATE ... WHERE status='pending') — chống double-process
 *  - Retry tối đa 3 lần với exponential backoff (30s → 2m → 8m)
 *  - Socket.IO progress emit giữ nguyên
 *
 * Supported types: 'broadcast' | 'remarketing' | 'followup'
 */

const { getDB } = require('../../infra/database/sqliteConnection');
const { getIO } = require('../../infra/socket/socketManager');

const POLL_INTERVAL_MS  = 5_000;  // 5 giây poll 1 lần
const SEND_DELAY_MS     = 2_500;  // 2.5s giữa mỗi tin (anti-spam Facebook)
const BACKOFF_SECONDS   = [30, 120, 480]; // retry sau: 30s, 2m, 8m

let pollerTimer = null;
let isRunning   = false; // guard: chỉ chạy 1 worker tại một thời điểm

/* ─── Enqueue a new job ──────────────────────────────────────── */
async function enqueue(shopId, type, payload) {
  const db = getDB();
  const result = await db.run(
    `INSERT INTO Jobs (shop_id, type, payload, status, run_after)
     VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
    [shopId, type, JSON.stringify(payload)]
  );
  console.log(`[QUEUE] Enqueued job #${result.lastID} type=${type} shop=${shopId}`);
  return result.lastID;
}

/* ─── Atomically claim the next available job ────────────────── */
async function claimNextJob(db) {
  // Atomic: UPDATE trước, sau đó SELECT — tránh race condition
  const now = new Date().toISOString();
  await db.run(
    `UPDATE Jobs
     SET status = 'running', started_at = ?, attempts = attempts + 1
     WHERE id = (
       SELECT id FROM Jobs
       WHERE status = 'pending' AND datetime(run_after) <= datetime(?)
       ORDER BY run_after ASC
       LIMIT 1
     )`,
    [now, now]
  );
  return db.get(`SELECT * FROM Jobs WHERE status = 'running' AND started_at = ? LIMIT 1`, [now]);
}

/* ─── Mark job done ──────────────────────────────────────────── */
async function completeJob(db, jobId) {
  await db.run(
    `UPDATE Jobs SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [jobId]
  );
}

/* ─── Mark job failed — schedule retry or permanent failure ─── */
async function failJob(db, job, errMsg) {
  const nextAttempt = job.attempts; // already incremented
  if (nextAttempt < job.max_attempts) {
    const delaySec = BACKOFF_SECONDS[nextAttempt - 1] || 480;
    const runAfter = new Date(Date.now() + delaySec * 1000).toISOString();
    await db.run(
      `UPDATE Jobs SET status = 'pending', error = ?, run_after = ? WHERE id = ?`,
      [errMsg, runAfter, job.id]
    );
    console.warn(`[QUEUE] Job #${job.id} failed (attempt ${nextAttempt}/${job.max_attempts}), retry in ${delaySec}s`);
  } else {
    await db.run(
      `UPDATE Jobs SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [errMsg, job.id]
    );
    console.error(`[QUEUE] Job #${job.id} permanently failed after ${nextAttempt} attempts: ${errMsg}`);
  }
}

/* ─── Broadcast processor ────────────────────────────────────── */
async function processBroadcastJob(payload) {
  const { broadcastId } = payload;
  const { processBroadcast } = require('../broadcast/broadcastProcessor');
  await processBroadcast(broadcastId);
}

/* ─── Remarketing processor ──────────────────────────────────── */
async function processRemarketingJob(payload) {
  const { campaignId, shopId, message, image_url, recipients, pageTokenMap: tokenMapArr } = payload;
  const { resolvePageToken } = require('../../api/services/broadcastService');
  const io = getIO();

  // Re-hydrate pageTokenMap từ serialized array
  const pageTokenMap = new Map(tokenMapArr);

  const db = getDB();
  let sent = 0, failed = 0;

  console.log(`[QUEUE/REMARKETING] Bắt đầu #${campaignId}: ${recipients.length} khách`);

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const personalizedMsg = message.replace(/\{\{name\}\}/gi, r.name || 'bạn');

    try {
      const pageToken = resolvePageToken(pageTokenMap, r);
      if (!pageToken) { failed++; continue; }

      const fbRes = await fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: r.platform_id },
            message: image_url
              ? { attachment: { type: 'image', payload: { url: image_url, is_reusable: true } } }
              : { text: personalizedMsg },
          }),
        }
      );
      const json = await fbRes.json();
      if (json.error) { failed++; console.warn(`[QUEUE/REMARKETING] FB err ${r.platform_id}:`, json.error.message); }
      else sent++;
    } catch (e) {
      failed++;
      console.warn(`[QUEUE/REMARKETING] send err:`, e.message);
    }

    // Emit progress
    if (io) {
      io.to(`shop_${shopId}`).emit('remarketing_progress', {
        campaignId, sent, failed, total: recipients.length,
        current: i + 1, percent: Math.round(((i + 1) / recipients.length) * 100),
      });
    }

    if (i < recipients.length - 1) {
      await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    }
  }

  // Cập nhật DB campaign
  await db.run(
    `UPDATE Broadcasts SET status = 'completed', sent = ?, failed = ? WHERE id = ?`,
    [sent, failed, campaignId]
  );

  if (io) {
    io.to(`shop_${shopId}`).emit('remarketing_progress', {
      campaignId, sent, failed, total: recipients.length, current: recipients.length,
      percent: 100, done: true,
    });
  }

  console.log(`[QUEUE/REMARKETING] #${campaignId} hoàn tất: ${sent} thành công, ${failed} lỗi`);
}

/* ─── Followup processor ─────────────────────────────────────── */
async function processFollowupJob(payload) {
  const { customerId, shopId, message, pageToken, platformId } = payload;
  const fbRes = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: platformId },
        message: { text: message },
      }),
    }
  );
  const json = await fbRes.json();
  if (json.error) {
    throw new Error(`FB API: ${json.error.message}`);
  }
  console.log(`[QUEUE/FOLLOWUP] Đã gửi follow-up cho customer #${customerId}`);
}

/* ─── Dispatch to correct processor ─────────────────────────── */
async function processJob(job) {
  const payload = JSON.parse(job.payload);
  switch (job.type) {
    case 'broadcast':  return processBroadcastJob(payload);
    case 'remarketing': return processRemarketingJob(payload);
    case 'followup':   return processFollowupJob(payload);
    default: throw new Error(`Unknown job type: ${job.type}`);
  }
}

/* ─── Main poll loop ─────────────────────────────────────────── */
async function pollOnce() {
  if (isRunning) return;
  isRunning = true;
  const db = getDB();
  try {
    const job = await claimNextJob(db);
    if (!job) return;

    console.log(`[QUEUE] Processing job #${job.id} type=${job.type} (attempt ${job.attempts}/${job.max_attempts})`);
    try {
      await processJob(job);
      await completeJob(db, job.id);
      console.log(`[QUEUE] ✅ Job #${job.id} done`);
    } catch (err) {
      await failJob(db, job, err.message);
    }
  } catch (err) {
    console.error('[QUEUE] Poll error:', err.message);
  } finally {
    isRunning = false;
  }
}

/* ─── Start / Stop ───────────────────────────────────────────── */
function startWorker() {
  if (pollerTimer) return;
  console.log(`[QUEUE] Worker started — polling every ${POLL_INTERVAL_MS / 1000}s`);
  pollerTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
  // Chạy ngay lần đầu để xử lý pending jobs từ lần restart trước
  pollOnce();
}

function stopWorker() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log('[QUEUE] Worker stopped');
  }
}

module.exports = { enqueue, startWorker, stopWorker };
