'use strict';

/**
 * RAG Service — Retrieval-Augmented Generation cho AI Chatbot
 *
 * Pipeline:
 *  1. retrieveFAQ()   → tìm FAQ liên quan đến tin nhắn khách (keyword + fuzzy match)
 *  2. buildRAGContext() → format FAQ + products thành context block cho AI
 *  3. parseRAGResponse() → bóc tách confidence từ response của Gemini
 *  4. shouldEscalate() → quyết định có chuyển nhân viên thật không
 *
 * Nguyên tắc kiểm soát:
 *  - AI chỉ được trả lời những gì có trong FAQ hoặc Product catalog
 *  - Giá/Tồn kho → lấy từ DB, không cho AI bịa
 *  - Confidence < ESCALATE_THRESHOLD → chuyển nhân viên + ghi log
 *  - Câu hỏi không khớp FAQ nào → chuẩn bị fallback cụ thể, không vague
 */

const { getDB } = require('../../infra/database/sqliteConnection');

const ESCALATE_THRESHOLD = 0.55; // confidence dưới ngưỡng này → chuyển người thật
const MAX_FAQ_INJECT     = 8;    // Tối đa 8 FAQ/request để không bloat prompt

// ─── 1. Retrieve relevant FAQs ──────────────────────────────────
/**
 * Tìm FAQs liên quan đến messageText bằng keyword matching.
 * Strategy: tách words từ message → tìm FAQ nào có question LIKE '%word%'
 * Trả về tối đa MAX_FAQ_INJECT FAQ, sort by relevance score.
 *
 * @param {number} shopId
 * @param {string} messageText
 * @param {string|null} integrationId  — nếu có, filter FAQ theo fanpage
 * @returns {Promise<Array<{id, question, answer, category, score}>>}
 */
async function retrieveFAQ(shopId, messageText, integrationId = null) {
  const db = getDB();

  // Lấy toàn bộ FAQ active của shop
  const allFaqs = await db.all(
    `SELECT id, question, answer, category, integration_ids
     FROM FAQ
     WHERE shop_id = ? AND is_active = 1
     ORDER BY updated_at DESC`,
    [shopId]
  );

  if (allFaqs.length === 0) return [];

  // Tokenize: bỏ stopwords, giữ meaningful keywords ≥ 2 chars
  const STOP_WORDS = new Set(['và', 'hay', 'hoặc', 'thì', 'của', 'là', 'có', 'cho', 'được', 'không', 'bạn', 'em', 'anh', 'chị', 'ạ', 'nha', 'nhé', 'dạ', 'ơi', 'vậy', 'ạ', 'thế', 'nào', 'này', 'đó', 'rồi', 'ở', 'với', 'để', 'mà', 'thì', 'đã', 'sẽ']);
  const words = messageText
    .toLowerCase()
    .replace(/[?!.,;:'"()]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  if (words.length === 0) {
    // Không có keyword → trả về 3 FAQ mặc định (general)
    return allFaqs.slice(0, 3).map(f => ({ ...f, score: 0.3 }));
  }

  // Score từng FAQ dựa trên số keyword match
  const scored = allFaqs.map(faq => {
    const searchText = (faq.question + ' ' + faq.answer + ' ' + (faq.category || '')).toLowerCase();
    let hits = 0;
    let exactPhraseBonus = 0;

    for (const word of words) {
      if (searchText.includes(word)) hits++;
    }

    // Bonus nếu phrase 2+ words khớp liên tiếp
    if (words.length >= 2) {
      const bigrams = words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`);
      for (const bigram of bigrams) {
        if (searchText.includes(bigram)) exactPhraseBonus += 0.3;
      }
    }

    // Filter theo integration_id nếu có
    if (integrationId && faq.integration_ids) {
      try {
        const ids = JSON.parse(faq.integration_ids);
        // Bug 3 fix: coerce cả 2 về string để tránh number vs string mismatch
        if (Array.isArray(ids) && ids.length > 0 && !ids.map(String).includes(String(integrationId))) {
          return { ...faq, score: -1 }; // Không thuộc page này → loại
        }
      } catch {}
    }

    const score = words.length > 0
      ? (hits / words.length) + exactPhraseBonus
      : 0;

    return { ...faq, score };
  });

  return scored
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FAQ_INJECT);
}

// ─── 2. Build RAG context string ─────────────────────────────────
/**
 * Format FAQ list thành text block inject vào Gemini prompt.
 * Dùng format rõ ràng để AI hiểu đây là "nguồn sự thật" (ground truth).
 */
function buildFAQContext(faqs) {
  if (!faqs || faqs.length === 0) return '';

  const entries = faqs.map((f, i) =>
    `Q${i + 1}: ${f.question}\nA${i + 1}: ${f.answer}${f.category ? ` [Chủ đề: ${f.category}]` : ''}`
  ).join('\n\n');

  return `
═══════════════════════════════════════════
📚 CƠ SỞ KIẾN THỨC SHOP (NGUỒN SỰ THẬT — ƯU TIÊN CAO NHẤT):
Các câu trả lời dưới đây là CHÍNH XÁCH do chủ shop cung cấp.
TUYỆT ĐỐI dùng thông tin từ đây khi trả lời khách. KHÔNG tự bịa thêm.
Nếu câu hỏi của khách KHÔNG có trong đây → trả về confidence thấp (< 0.5).
═══════════════════════════════════════════
${entries}
═══════════════════════════════════════════`;
}

// ─── 3. Build enriched system prompt with RAG guard instructions ──
/**
 * Bổ sung vào systemPrompt các chỉ thị RAG kiểm soát:
 *  - Chỉ trả lời dựa trên FAQ/catalog
 *  - Phải có confidence score trong response
 *  - Không bịa giá, tồn kho
 */
function buildRAGSystemInstructions() {
  return `
══════════ QUY TẮC RAG — BẮT BUỘC TUYỆT ĐỐI ══════════
Bạn PHẢI tuân theo các quy tắc sau khi trả lời:

1. CHỈ TRẢ LỜI dựa trên thông tin trong "CƠ SỞ KIẾN THỨC SHOP" và "DANH SÁCH SẢN PHẨM".
2. KHÔNG BAO GIỜ tự bịa thông tin về: giá, tồn kho, chính sách, thời gian giao hàng.
3. Nếu câu hỏi của khách KHÔNG có trong cơ sở kiến thức → trả lời:
   "Dạ câu hỏi này em cần xác nhận lại với shop để trả lời chính xác nhất ạ! Anh/chị để lại SĐT để nhân viên liên hệ ngay nhé 😊"
4. Nếu khách hỏi giá sản phẩm KHÔNG có trong danh mục → KHÔNG báo giá. Mời khách inbox riêng.
5. Phải luôn thêm trường "confidence" trong JSON response (0.0 → 1.0):
   - 0.8 → 1.0: Câu trả lời có trong FAQ/catalog chính xác
   - 0.5 → 0.8: Câu trả lời suy luận được từ context, có thể đúng
   - 0.0 → 0.5: Không có thông tin → cần chuyển nhân viên
6. Thêm trường "source": "faq" | "catalog" | "general" | "escalate" để tracking.
════════════════════════════════════════════════`;
}

// ─── 4. Parse Gemini response with confidence ─────────────────────
/**
 * Bóc tách confidence và source từ Gemini response.
 * Gemini sẽ trả JSON: { intent, reply, confidence, source }
 * Nếu không có confidence → mặc định 0.7 (assume OK).
 */
function parseRAGResponse(rawResponse) {
  // rawResponse có thể là object từ agenticAnalyzeMessage
  if (typeof rawResponse === 'object' && rawResponse !== null) {
    // Bug 2 fix: null confidence = AI không trả về → dùng heuristic 0.7
    // number confidence = AI trả về thật → dùng giá trị thật
    const confidence = typeof rawResponse.confidence === 'number'
      ? rawResponse.confidence
      : 0.7; // heuristic fallback

    return {
      intent:     rawResponse.intent     || 'KHÁC',
      reply:      rawResponse.reply      || null,
      confidence,
      source:     rawResponse.source     || 'general',
      toolCalls:  rawResponse.toolCalls  || [],
      errorCode:  rawResponse.errorCode  || null,
    };
  }

  // String response → try parse JSON
  try {
    const jsonMatch = (rawResponse || '').match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent:     parsed.intent     || 'KHÁC',
        reply:      parsed.reply      || rawResponse,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        source:     parsed.source     || 'general',
        toolCalls:  [],
        errorCode:  null,
      };
    }
  } catch {}

  // Fallback
  return { intent: 'KHÁC', reply: rawResponse, confidence: 0.7, source: 'general', toolCalls: [], errorCode: null };
}

// ─── 5. Escalation logic ──────────────────────────────────────────
/**
 * Quyết định có cần chuyển nhân viên thật không.
 * @returns {{ shouldEscalate: boolean, reason: string }}
 */
function shouldEscalate(ragResult) {
  if (ragResult.errorCode) {
    return { shouldEscalate: true, reason: `AI error: ${ragResult.errorCode}` };
  }
  if (ragResult.source === 'escalate') {
    return { shouldEscalate: true, reason: 'AI tự nhận không có thông tin' };
  }
  if (typeof ragResult.confidence === 'number' && ragResult.confidence < ESCALATE_THRESHOLD) {
    return { shouldEscalate: true, reason: `Low confidence: ${ragResult.confidence.toFixed(2)}` };
  }
  return { shouldEscalate: false, reason: null };
}

/**
 * Tạo escalation reply thay thế khi AI không đủ tin cậy.
 * Tự nhiên, không lộ là bot.
 */
function buildEscalationReply(customerName) {
  const name = customerName ? ` ${customerName}` : '';
  const templates = [
    `Dạ câu hỏi này em cần xác nhận lại với bộ phận chuyên môn để trả lời chính xác nhất cho${name} ạ! Anh/chị để lại SĐT để nhân viên liên hệ ngay nhé 😊`,
    `Dạ để em kiểm tra lại thông tin chính xác rồi báo${name} ngay nha! Anh/chị có thể để lại số điện thoại không ạ? Em sẽ gọi lại sớm nhất 📞`,
    `Dạ vấn đề này em cần xác nhận với quản lý trước ạ. Anh/chị vui lòng để lại SĐT để nhân viên liên hệ trong 15 phút nhé! ☎️`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Đánh dấu customer cần nhân viên thật trong DB (is_ai_paused = 1).
 */
async function markNeedsHuman(customerId, shopId, reason) {
  try {
    const db = getDB();
    await db.run(
      `UPDATE Customers SET is_ai_paused = 1 WHERE id = ? AND shop_id = ?`,
      [customerId, shopId]
    );
    console.log(`[RAG] 🔔 Customer #${customerId} → needs_human (${reason})`);
  } catch (err) {
    console.warn('[RAG] Không thể mark needs_human:', err.message);
  }
}

// ─── 6. Main pipeline function ────────────────────────────────────
/**
 * buildRAGContext — entry point cho facebook.controller.js
 *
 * Trả về:
 *  {
 *    faqContext: string,          // Inject vào enrichedCatalog
 *    ragInstructions: string,     // Inject vào systemPrompt
 *    relevantFaqs: FAQ[],         // Dùng cho logging
 *  }
 */
async function buildRAGContext(shopId, messageText, integrationId = null) {
  const [relevantFaqs] = await Promise.all([
    retrieveFAQ(shopId, messageText, integrationId),
  ]);

  const faqContext      = buildFAQContext(relevantFaqs);
  const ragInstructions = buildRAGSystemInstructions();

  return { faqContext, ragInstructions, relevantFaqs };
}

module.exports = {
  buildRAGContext,
  parseRAGResponse,
  shouldEscalate,
  buildEscalationReply,
  markNeedsHuman,
  retrieveFAQ,
  ESCALATE_THRESHOLD,
};
