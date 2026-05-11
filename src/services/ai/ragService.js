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

  // P2a fix: normalize dấu tiếng Việt → ASCII để match không phân biệt dấu
  // VD: "gio hang" khớp "giỏ hàng", "ship" khớp "giao"
  const normalizeVN = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

  const STOP_WORDS = new Set(['va', 'hay', 'hoac', 'thi', 'cua', 'la', 'co', 'cho', 'duoc', 'khong', 'ban', 'em', 'anh', 'chi', 'a', 'nha', 'nhe', 'da', 'oi', 'vay', 'the', 'nao', 'nay', 'do', 'roi', 'o', 'voi', 'de', 'ma', 'se']);

  const normalizedMsg = normalizeVN(messageText).replace(/[?!.,;:'"()]/g, ' ');
  const words = normalizedMsg
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  if (words.length === 0) {
    return []; // Không có keyword → không inject FAQ (tránh hallucinate ngẫu nhiên)
  }

  // Score từng FAQ dựa trên số keyword match (cả normalized)
  const scored = allFaqs.map(faq => {
    const raw = (faq.question + ' ' + faq.answer + ' ' + (faq.category || '')).toLowerCase();
    const searchText = normalizeVN(raw); // P2a: normalize FAQ text
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

  // Fix Issue 2: min-score threshold = 0.25 (tránh inject FAQ nhiễu khi chỉ khớp 1 keyword nhỏ)
  // Ví dụ: 5 từ khóa, hit 1 → score=0.2 → bị lọc; hit 2+ → score≥0.4 → pass
  const MIN_FAQ_SCORE = 0.25;
  const MAX_FAQ_RESULTS = 5; // Giới hạn top-5 (tập trung, ít noise hơn top-10)

  return scored
    .filter(f => f.score >= MIN_FAQ_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FAQ_RESULTS);
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
Các câu trả lời dưới đây là CHÍNH XÁC do chủ shop cung cấp.
TUYỆT ĐỐI dùng thông tin từ đây khi trả lời khách. KHÔNG tự bịa thêm.
Nếu câu hỏi của khách KHÔNG có trong đây → NGAY LẬP TỨC dùng source="escalate" và confidence=0.0.
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
    // Bug 2 fix: null confidence = AI không trả về → dùng heuristic 0.5 (conservative)
    // Bug 6 fix: giảm từ 0.7 xuống 0.5 — gần ngưỡng escalation 0.55 → buộc AI phải có confidence rõ ràng
    const confidence = typeof rawResponse.confidence === 'number'
      ? rawResponse.confidence
      : 0.5; // conservative fallback

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
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5, // Bug 6 fix
        source:     parsed.source     || 'general',
        toolCalls:  [],
        errorCode:  null,
      };
    }
  } catch {}

  // Fallback
  return { intent: 'KHÁC', reply: rawResponse, confidence: 0.5, source: 'general', toolCalls: [], errorCode: null };
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
  // Fix: KHÔNG set is_ai_paused=1 — điều đó khóa AI vĩnh viễn cho khách chỉ vì 1 câu confidence thấp.
  // Escalation chỉ có nghĩa là "turn này chuyển nhân viên" — không phải khóa mãi mãi.
  // Staff nhìn thấy ESCALATE intent trên Dashboard và có thể take over thủ công nếu cần.
  console.log(`[RAG] 🔔 Escalation logged for Customer #${customerId} (${reason}) — AI vẫn active cho lần sau`);
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
  // noFaqMatch: true khi không có FAQ nào khớp → controller sẽ áp dụng confidence penalty
  // để ngăn AI trả lời bịa thông tin shop khi không có kiến thức cơ sở
  const noFaqMatch = relevantFaqs.length === 0;

  return { faqContext, ragInstructions, relevantFaqs, noFaqMatch };
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
