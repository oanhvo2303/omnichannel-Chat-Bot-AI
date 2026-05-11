'use strict';

const { getDB } = require('../../infra/database/sqliteConnection');

/**
 * AuditLog Service — Ghi nhật ký hành động quan trọng
 *
 * KHÔNG BAO GIỜ throw — lỗi ghi audit không được làm gián đoạn operation chính.
 *
 * @param {object} params
 * @param {number}  params.shopId
 * @param {number}  [params.actorId]   — staffId (null = shop owner)
 * @param {string}  [params.actorRole]
 * @param {string}  params.action      — VD: 'UPDATE_BOT_RULE'
 * @param {string}  [params.resource]  — VD: 'BotRules'
 * @param {string}  [params.resourceId]
 * @param {any}     [params.detail]    — Object hoặc string mô tả
 * @param {string}  [params.ip]
 */
async function writeAudit({ shopId, actorId = null, actorRole = null, action, resource = null, resourceId = null, detail = null, ip = null }) {
  try {
    const db = getDB();
    const detailStr = detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null;
    await db.run(
      `INSERT INTO AuditLogs (shop_id, actor_id, actor_role, action, resource, resource_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [shopId, actorId || null, actorRole || null, action, resource, resourceId ? String(resourceId) : null, detailStr, ip || null]
    );
  } catch (err) {
    // Audit failure KHÔNG được block operation chính
    console.error('[AUDIT] Ghi audit thất bại (non-fatal):', err.message);
  }
}

/**
 * Helper: extract IP từ request (trust proxy đã được set)
 */
function getClientIp(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
}

/**
 * Express middleware factory — tự động ghi audit cho route handler
 *
 * Dùng cho các action đơn giản không cần resourceId từ response.
 *
 * @example
 *   router.delete('/:id', requireOwnerOrAdmin, auditMiddleware('DELETE_PRODUCT', 'Products'), handler)
 */
function auditMiddleware(action, resource = null) {
  return (req, _res, next) => {
    // Ghi audit KHÔNG chờ (fire-and-forget)
    writeAudit({
      shopId: req.shop?.shopId,
      actorId: req.shop?.staffId,
      actorRole: req.shop?.role,
      action,
      resource,
      resourceId: req.params?.id,
      detail: { method: req.method, path: req.path, body: sanitizeBody(req.body) },
      ip: getClientIp(req),
    });
    next();
  };
}

/**
 * Loại bỏ các field nhạy cảm trước khi ghi vào audit log
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const SENSITIVE = new Set(['password', 'password_hash', 'access_token', 'capi_token', 'token', 'secret', 'jwt']);
  const clean = {};
  for (const [k, v] of Object.entries(body)) {
    clean[k] = SENSITIVE.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return clean;
}

module.exports = { writeAudit, getClientIp, auditMiddleware };
