'use strict';

const { getDB } = require('../../infra/database/sqliteConnection');

// =============================================
// Tag Executor — Agent thực thi gắn/gỡ thẻ từ AI
// Pattern giống orderExecutor.js
// =============================================

/**
 * Thực thi gắn/gỡ thẻ khách hàng do AI yêu cầu qua Function Calling.
 * - Upsert tags (tạo mới nếu chưa tồn tại)
 * - INSERT/DELETE CustomerTags
 * - Emit Socket.IO event cho real-time update
 *
 * @param {object} args — Arguments từ Gemini Function Call
 * @param {string} args.action — 'add' hoặc 'remove'
 * @param {string[]} args.tag_names — Mảng tên thẻ (VD: ['Khách tiềm năng', 'Hỏi giá'])
 * @param {number} shopId
 * @param {number} customerId
 * @returns {Promise<{success: boolean, action: string, tags: string[], message: string}>}
 */
async function executeAITag(args, shopId, customerId) {
  const db = getDB();
  const { action = 'add', tag_names = [] } = args;

  console.log('═'.repeat(60));
  console.log('[TAG EXECUTOR] 🏷️ AI yêu cầu gắn/gỡ thẻ');
  console.log(`[TAG EXECUTOR]   📦 Shop #${shopId} | 👤 Khách #${customerId}`);
  console.log(`[TAG EXECUTOR]   🎯 Action: ${action}`);
  console.log(`[TAG EXECUTOR]   🏷️  Tags: [${tag_names.join(', ')}]`);
  console.log('═'.repeat(60));

  try {
    // Guard: Validate inputs
    if (!Array.isArray(tag_names) || tag_names.length === 0) {
      console.warn('[TAG EXECUTOR] ⚠️ tag_names rỗng hoặc không phải array.');
      return {
        success: false,
        action,
        tags: [],
        message: 'Không có thẻ nào được chỉ định.',
      };
    }

    // Verify customer belongs to shop (Multi-tenant security)
    const customer = await db.get(
      'SELECT id FROM Customers WHERE id = ? AND shop_id = ?',
      [customerId, shopId]
    );
    if (!customer) {
      console.error(`[TAG EXECUTOR] ❌ Khách #${customerId} không thuộc Shop #${shopId}`);
      return {
        success: false,
        action,
        tags: tag_names,
        message: 'Khách hàng không hợp lệ.',
      };
    }

    // Auto-assign colors for new tags
    const TAG_COLORS = [
      '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6',
      '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#78716C',
    ];

    const processedTags = [];

    if (action === 'add') {
      // ═══════════════════════════════════════
      // ADD: Upsert tags + gắn CustomerTags
      // ═══════════════════════════════════════
      for (const tagName of tag_names) {
        const trimmed = tagName.trim();
        if (!trimmed) continue;

        // Step 1: Tìm hoặc tạo tag
        let tag = await db.get(
          'SELECT id, name, color FROM Tags WHERE shop_id = ? AND LOWER(name) = LOWER(?)',
          [shopId, trimmed]
        );

        if (!tag) {
          // Auto-create with random color
          const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
          const result = await db.run(
            'INSERT INTO Tags (shop_id, name, color) VALUES (?, ?, ?)',
            [shopId, trimmed, color]
          );
          tag = { id: result.lastID, name: trimmed, color };
          console.log(`[TAG EXECUTOR] ✨ Tạo thẻ mới: "${trimmed}" (${color})`);
        }

        // Step 2: Gắn tag cho khách (ignore if exists)
        await db.run(
          'INSERT OR IGNORE INTO CustomerTags (customer_id, tag_id) VALUES (?, ?)',
          [customerId, tag.id]
        );

        processedTags.push(tag);
        console.log(`[TAG EXECUTOR] ✅ Gắn thẻ "${trimmed}" → Khách #${customerId}`);
      }

      const tagLabels = processedTags.map(t => t.name).join(', ');
      console.log(`[TAG EXECUTOR] 🎉 Hoàn tất gắn ${processedTags.length} thẻ: [${tagLabels}]`);

      return {
        success: true,
        action: 'add',
        tags: processedTags,
        tagNames: processedTags.map(t => t.name),
        customerId,
        shopId,
        message: `Đã gắn thẻ: ${tagLabels}`,
      };

    } else if (action === 'remove') {
      // ═══════════════════════════════════════
      // REMOVE: Gỡ tags khỏi CustomerTags
      // ═══════════════════════════════════════
      for (const tagName of tag_names) {
        const trimmed = tagName.trim();
        if (!trimmed) continue;

        const tag = await db.get(
          'SELECT id, name FROM Tags WHERE shop_id = ? AND LOWER(name) = LOWER(?)',
          [shopId, trimmed]
        );

        if (tag) {
          await db.run(
            'DELETE FROM CustomerTags WHERE customer_id = ? AND tag_id = ?',
            [customerId, tag.id]
          );
          processedTags.push(tag);
          console.log(`[TAG EXECUTOR] 🗑️ Gỡ thẻ "${trimmed}" khỏi Khách #${customerId}`);
        }
      }

      const tagLabels = processedTags.map(t => t.name).join(', ');
      return {
        success: true,
        action: 'remove',
        tags: processedTags,
        tagNames: processedTags.map(t => t.name),
        customerId,
        shopId,
        message: `Đã gỡ thẻ: ${tagLabels}`,
      };

    } else {
      return {
        success: false,
        action,
        tags: [],
        message: `Action "${action}" không hợp lệ. Chỉ hỗ trợ "add" hoặc "remove".`,
      };
    }

  } catch (error) {
    console.error('[TAG EXECUTOR] ❌ FATAL ERROR:', error.message);
    console.error('[TAG EXECUTOR] Stack:', error.stack?.substring(0, 400));
    return {
      success: false,
      action,
      tags: [],
      message: `Lỗi hệ thống khi gắn thẻ: ${error.message}`,
    };
  }
}

module.exports = { executeAITag };
