'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config');

// =============================================
// Gemini AI Service — Agent B (Não bộ AI)
// Enhanced: Error Classification + Retry + Mega Tracing
// =============================================

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// =============================================
// Model Cache per API Key (tránh recreate mỗi request)
// =============================================
const modelCache = new Map();

function getModelsForKey(apiKey) {
  const key = apiKey || config.gemini.apiKey;
  if (!key) throw new Error('Không tìm thấy Gemini API Key (cả shop lẫn global).');

  if (modelCache.has(key)) return modelCache.get(key);

  const ai = new GoogleGenerativeAI(key);
  const textModel = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  });
  const agentModel = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: ORDER_TOOL_DECLARATIONS,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  });

  const models = { textModel, agentModel };
  modelCache.set(key, models);
  return models;
}

// =============================================
// Agentic Model — Có Function Calling (Tool Use)
// =============================================
const ORDER_TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: 'create_system_order',
        description: 'Tạo đơn hàng mới trong hệ thống khi khách hàng đồng ý mua sản phẩm và đã cung cấp đầy đủ SĐT + Địa chỉ giao hàng. CHỈ gọi khi có ĐỦ 3 thông tin: tên sản phẩm, SĐT, địa chỉ.',
        parameters: {
          type: 'OBJECT',
          properties: {
            product_name: {
              type: 'STRING',
              description: 'Tên sản phẩm khách muốn mua (VD: áo thun, quần jeans)',
            },
            quantity: {
              type: 'INTEGER',
              description: 'Số lượng sản phẩm muốn mua. Mặc định là 1.',
            },
            customer_phone: {
              type: 'STRING',
              description: 'Số điện thoại giao hàng của khách (VD: 0912345678)',
            },
            customer_address: {
              type: 'STRING',
              description: 'Địa chỉ giao hàng đầy đủ (VD: 123 Nguyễn Huệ, Q.1, TP.HCM)',
            },
            customer_name: {
              type: 'STRING',
              description: 'Tên người nhận hàng thực tế. Bóc tách từ tin nhắn nếu khách có nhắc tên (VD: "Ship cho Tuấn" → customer_name = "Tuấn"). Nếu khách KHÔNG nhắc tên → dùng tên Facebook profile mặc định.',
            },
          },
          required: ['product_name', 'customer_phone', 'customer_address'],
        },
      },
      {
        name: 'update_customer_tags',
        description: 'Tự động gắn hoặc gỡ thẻ phân loại cho khách hàng dựa trên ngữ cảnh hội thoại. Gọi hàm này để phân loại khách.',
        parameters: {
          type: 'OBJECT',
          properties: {
            action: {
              type: 'STRING',
              description: 'Hành động: "add" để gắn thẻ, "remove" để gỡ thẻ.',
            },
            tag_names: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Mảng tên thẻ cần gắn/gỡ. VD: ["Khách tiềm năng", "Hỏi giá"]',
            },
          },
          required: ['action', 'tag_names'],
        },
      },
      {
        name: 'execute_bot_script',
        description: 'Thực thi kịch bản tin nhắn nhiều bước (multi-step script) có sẵn trong Kho Kiến Thức. Khi Kho Kiến Thức có [SCRIPT_ID:X], gọi hàm này với rule_id=X để hệ thống gửi kịch bản cho khách.',
        parameters: {
          type: 'OBJECT',
          properties: {
            rule_id: {
              type: 'INTEGER',
              description: 'ID của kịch bản cần thực thi (lấy từ [SCRIPT_ID:X] trong Kho Kiến Thức). VD: 6',
            },
          },
          required: ['rule_id'],
        },
      },
    ],
  },
];

// ← ORDER_TOOL_DECLARATIONS + model cache đã được định nghĩa ở trên

/**
 * Legacy: Default model (dùng global key)
 */
const model = (() => {
  try {
    return getModelsForKey(config.gemini.apiKey).textModel;
  } catch {
    return null; // Global key không có → chỉ dùng per-shop key
  }
})();


// =============================================
// Error Classification — Phân loại lỗi AI
// =============================================
const AI_ERROR_CODES = {
  AUTH_ERROR: 'AUTH_ERROR',         // Sai API Key / hết hạn
  RATE_LIMIT: 'RATE_LIMIT',        // Quá tải / hết quota
  NETWORK_ERROR: 'NETWORK_ERROR',  // Mất mạng / timeout
  PARSE_ERROR: 'PARSE_ERROR',      // AI trả về rác, không parse được JSON
  UNKNOWN: 'UNKNOWN',              // Lỗi không xác định
};

/**
 * Phân loại lỗi từ Gemini API response để controller xử lý đúng context.
 * @param {Error} error
 * @returns {string} AI_ERROR_CODES
 */
function classifyAIError(error) {
  const msg = (error.message || '').toLowerCase();
  const status = error.status || error.statusCode || error.httpCode;

  // Auth errors
  if (status === 401 || status === 403 || msg.includes('api_key') || msg.includes('api key') || msg.includes('permission') || msg.includes('authentication')) {
    return AI_ERROR_CODES.AUTH_ERROR;
  }
  // Rate limit / quota
  if (status === 429 || msg.includes('quota') || msg.includes('rate') || msg.includes('resource_exhausted') || msg.includes('too many')) {
    return AI_ERROR_CODES.RATE_LIMIT;
  }
  // Network errors
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('timeout') || msg.includes('network') || msg.includes('socket') || msg.includes('fetch')) {
    return AI_ERROR_CODES.NETWORK_ERROR;
  }
  // JSON parse errors
  if (msg.includes('json') || msg.includes('parse') || msg.includes('unexpected token')) {
    return AI_ERROR_CODES.PARSE_ERROR;
  }
  return AI_ERROR_CODES.UNKNOWN;
}

/**
 * Tạo human-readable error message cho Frontend toast
 * @param {string} errorCode
 * @returns {string}
 */
function getHumanErrorMessage(errorCode) {
  switch (errorCode) {
    case AI_ERROR_CODES.AUTH_ERROR:
      return 'API Key AI không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại GEMINI_API_KEY trong cài đặt.';
    case AI_ERROR_CODES.RATE_LIMIT:
      return 'AI đã hết quota (số lần gọi). Vui lòng chờ hoặc nâng cấp gói API.';
    case AI_ERROR_CODES.NETWORK_ERROR:
      return 'Không thể kết nối đến server AI (Google). Kiểm tra kết nối mạng.';
    case AI_ERROR_CODES.PARSE_ERROR:
      return 'AI trả về dữ liệu không hợp lệ. Thử gửi lại tin nhắn.';
    default:
      return 'AI gặp lỗi không xác định. Vui lòng thử lại sau.';
  }
}

/**
 * Kiểm tra xem lỗi có nên retry không (chỉ retry cho lỗi thoáng qua)
 * @param {string} errorCode
 * @returns {boolean}
 */
function isRetryable(errorCode) {
  return errorCode === AI_ERROR_CODES.NETWORK_ERROR || errorCode === AI_ERROR_CODES.RATE_LIMIT;
}

/**
 * Analyses a customer message and returns structured JSON.
 * (Legacy function — dùng cho trường hợp không có system prompt)
 *
 * @param   {string} messageText — The raw text message from the customer.
 * @returns {Promise<{intent: string, reply: string, errorCode?: string, errorMessage?: string}>}
 */
const analyzeCustomerMessage = async (messageText) => {
  const prompt = `
Bạn là một chuyên viên CSKH thông minh, lịch sự và thân thiện.
Hãy phân tích tin nhắn sau của khách hàng và chỉ trả về JSON với đúng 2 trường:

{
  "intent": "(HỎI_GIÁ | ĐẶT_HÀNG | KHIẾU_NẠI | HỖ_TRỢ | CHÀO_HỎI | KHÁC)",
  "reply": "(Một câu trả lời tư vấn ngắn gọn, lịch sự bằng Tiếng Việt)"
}

Tin nhắn của khách: "${messageText}"
`;

  try {
    console.log(`[GEMINI LEGACY] ⏳ Đang gọi API Gemini cho tin: "${messageText.substring(0, 80)}..."`);
    const startTime = Date.now();
    const activeModel = model || getModelsForKey(null).textModel;
    const result = await activeModel.generateContent(prompt);
    let responseText = result.response.text();
    console.log(`[GEMINI LEGACY] ✅ API trả về sau ${Date.now() - startTime}ms. Raw: ${responseText.substring(0, 200)}`);

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) responseText = jsonMatch[0];
    else throw new Error('AI không nhả JSON hợp lệ: ' + responseText);

    // Safe JSON parse — AI đôi khi trả về text có {...} nhưng không hợp lệ
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (jsonErr) {
      console.warn('[GEMINI LEGACY] ⚠️ JSON parse thất bại, dùng raw text:', jsonErr.message);
      // Fallback: dùng raw text làm reply, intent mặc định
      const rawText = result.response.text().trim();
      return { intent: 'KHÁC', reply: rawText || 'Shop xin lỗi, có lỗi xử lý. Bạn vui lòng hỏi lại ạ!', toolCalls: [] };
    }
    console.log(`[GEMINI LEGACY] 🎯 Intent: ${parsed.intent} | Reply: "${parsed.reply?.substring(0, 60)}..."`);
    return parsed;
  } catch (error) {
    const errorCode = classifyAIError(error);
    const errorMessage = getHumanErrorMessage(errorCode);
    console.error('══════════════════════════════════════════');
    console.error('[GEMINI LEGACY] ❌❌❌ LỖI GỌI API AI ❌❌❌');
    console.error('[GEMINI LEGACY] Error Code:', errorCode);
    console.error('[GEMINI LEGACY] Error Name:', error.name);
    console.error('[GEMINI LEGACY] Error Message:', error.message);
    console.error('[GEMINI LEGACY] Error Status:', error.status || error.statusCode || 'N/A');
    console.error('[GEMINI LEGACY] Error Response Data:', JSON.stringify(error.response?.data || error.errorDetails || 'N/A'));
    console.error('[GEMINI LEGACY] Full Stack:', error.stack?.substring(0, 500));
    console.error('[GEMINI LEGACY] Human Message:', errorMessage);
    console.error('══════════════════════════════════════════');
    return {
      intent: 'LỖI',
      reply: null, // KHÔNG trả text cho khách khi AI lỗi
      errorCode,
      errorMessage,
    };
  }
};

/**
 * Phân tích tin nhắn dựa trên System Prompt (Tích cách) và Lịch sử hội thoại.
 * Enhanced: Error classification + 1 retry cho transient errors + tracing context.
 *
 * @param {string} messageText - Tin nhắn người dùng hiện tại
 * @param {string} systemPrompt - Prompt "nhồi sọ" tính cách của cửa hàng
 * @param {Array<{sender: string, text: string}>} history - 5 tin nhắn gần nhất
 * @param {{ shopId?: number, customerId?: number }} context - Tracing context
 * @returns {Promise<{intent: string, reply: string, errorCode?: string, errorMessage?: string}>}
 */
const advancedAnalyzeMessage = async (messageText, systemPrompt, history, context = {}) => {
  const { shopId = 'N/A', customerId = 'N/A' } = context;

  let historyText = history.map(h => `${h.sender === 'customer' ? 'Khách hàng' : 'Nhân viên/AI'}: "${h.text}"`).join('\n');
  if (!historyText) historyText = '(Chưa có lịch sử chat trước đó)';

  const prompt = `
Bạn là một trợ lý AI thông minh đại diện cho cửa hàng của chúng tôi.
====================
TÍNH CÁCH VÀ CHỈ LỆNH CỦA BẠN (SYSTEM PROMPT):
${systemPrompt || 'Bạn là nhân viên tư vấn khách hàng, hãy trả lời lịch sự, thân thiện.'}
====================
LỊCH SỬ CHAT GẦN ĐÂY:
${historyText}
====================
TIN NHẮN HIỆN TẠI CỦA KHÁCH:
Khách hàng: "${messageText}"
====================

PHẢN HỒI YÊU CẦU:
Dựa vào chỉ lệnh và ngữ cảnh ở trên, hãy trả lời khách hàng. CẦN THIẾT PHẢI CHỈ TRẢ VỀ CHUẨN JSON như sau, không kèm bất kỳ markdown nào:
{
  "intent": "(HỎI_GIÁ | ĐẶT_HÀNG | KHIẾU_NẠI | HỖ_TRỢ | CHÀO_HỎI | KHÁC)",
  "reply": "(Câu trả lời khéo léo, tự nhiên nhất)"
}
`;

  const MAX_RETRIES = 1;
  let lastError = null;
  let lastErrorCode = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const retryLabel = attempt > 0 ? ` (RETRY #${attempt})` : '';
      console.log('─'.repeat(60));
      console.log(`[GEMINI ADV]${retryLabel} ⏳ Đang gọi API Gemini (Advanced)`);
      console.log(`[GEMINI ADV]   📦 Shop #${shopId} | 👤 Khách #${customerId}`);
      console.log(`[GEMINI ADV]   💬 Tin nhắn: "${messageText.substring(0, 80)}..."`);
      console.log(`[GEMINI ADV]   📜 History: ${history.length} msgs | System Prompt: ${systemPrompt ? systemPrompt.substring(0, 50) + '...' : '(mặc định)'}`);

      const startTime = Date.now();
      const activeModel = context.shopApiKey ? getModelsForKey(context.shopApiKey).textModel : (model || getModelsForKey(null).textModel);
      const result = await activeModel.generateContent(prompt);
      let responseText = result.response.text();
      const elapsed = Date.now() - startTime;

      console.log(`[GEMINI ADV] ✅ API trả về sau ${elapsed}ms. Raw: ${responseText.substring(0, 200)}`);

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) responseText = jsonMatch[0];
      else throw new Error('AI không nhả JSON hợp lệ: ' + responseText);

      // Safe JSON parse — AI đôi khi trả về text có {...} nhưng không hợp lệ
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (jsonErr) {
        console.warn(`[GEMINI ADV] ⚠️ JSON parse thất bại (Attempt ${attempt + 1}), dùng raw text:`, jsonErr.message);
        // Fallback: trả về text thô thay vì throw error và retry
        const rawText = result.response.text().trim();
        return { intent: 'KHÁC', reply: rawText || 'Shop xin lỗi, có lỗi xử lý. Bạn vui lòng hỏi lại ạ!', toolCalls: [] };
      }
      console.log(`[GEMINI ADV] 🎯 Intent: ${parsed.intent} | Reply: "${parsed.reply?.substring(0, 60)}..."`);
      console.log('─'.repeat(60));
      return parsed;
    } catch (error) {
      lastError = error;
      lastErrorCode = classifyAIError(error);

      console.error('══════════════════════════════════════════');
      console.error(`[GEMINI ADV] ❌❌❌ LỖI GỌI API AI (Attempt ${attempt + 1}/${MAX_RETRIES + 1}) ❌❌❌`);
      console.error(`[GEMINI ADV] 📦 Shop #${shopId} | 👤 Khách #${customerId}`);
      console.error('[GEMINI ADV] Error Code:', lastErrorCode);
      console.error('[GEMINI ADV] Error Name:', error.name);
      console.error('[GEMINI ADV] Error Message:', error.message);
      console.error('[GEMINI ADV] Error Status:', error.status || error.statusCode || 'N/A');
      console.error('[GEMINI ADV] Error Response Data:', JSON.stringify(error.response?.data || error.errorDetails || 'N/A'));
      console.error('[GEMINI ADV] Full Stack:', error.stack?.substring(0, 500));
      console.error('══════════════════════════════════════════');

      // Retry chỉ cho lỗi thoáng qua (network, rate limit)
      if (attempt < MAX_RETRIES && isRetryable(lastErrorCode)) {
        const delay = 1500 * (attempt + 1); // Backoff: 1.5s, 3s
        console.log(`[GEMINI ADV] 🔄 Retrying in ${delay}ms... (Error is retryable: ${lastErrorCode})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  // Tất cả attempts đều thất bại
  const errorMessage = getHumanErrorMessage(lastErrorCode);
  console.error(`[GEMINI ADV] 💀 TẤT CẢ ${MAX_RETRIES + 1} ATTEMPTS ĐỀU THẤT BẠI. ErrorCode: ${lastErrorCode}`);
  console.error(`[GEMINI ADV] 🔔 Human Message cho Frontend: "${errorMessage}"`);

  return {
    intent: 'LỖI',
    reply: null, // KHÔNG gửi text cho khách khi AI lỗi
    errorCode: lastErrorCode,
    errorMessage,
  };
};

// =============================================
// AGENTIC: Function Calling — Tự tạo đơn hàng
// =============================================

/**
 * Phiên bản Agentic của advancedAnalyzeMessage.
 * Khi khách chốt đơn với đủ info → AI gọi create_system_order → hệ thống tạo đơn → AI phản hồi tự nhiên.
 *
 * @param {string} messageText
 * @param {string} systemPrompt
 * @param {Array} history
 * @param {{ shopId?: number, customerId?: number }} context
 * @param {string} productCatalog — Danh sách SP inject vào prompt
 * @returns {Promise<{intent: string, reply: string, toolCalls?: Array, errorCode?: string}>}
 */
const agenticAnalyzeMessage = async (messageText, systemPrompt, history, context = {}, productCatalog = '', imageData = null) => {
  const { shopId = 'N/A', customerId = 'N/A', customerName = 'Khách hàng', shopApiKey } = context;
  const { executeAIOrder } = require('./orderExecutor');
  const { executeAITag } = require('./tagExecutor');

  let historyText = history.map(h => `${h.sender === 'customer' ? 'Khách hàng' : 'Nhân viên/AI'}: "${h.text}"`).join('\n');
  if (!historyText) historyText = '(Chưa có lịch sử chat trước đó)';

  const agenticPrompt = `
Bạn là NHÂN VIÊN BÁN HÀNG THẬT (con người thật) đang chat với khách trên Messenger.
====================
QUY TẮC VÀNG — ĐÓNG VAI NGƯỜI THẬT (BẮT BUỘC TUYỆT ĐỐI):
1. Bạn là CON NGƯỜI, KHÔNG PHẢI AI/BOT. TUYỆT ĐỐI KHÔNG được tiết lộ mình là AI, chatbot, hệ thống tự động, hay bất kỳ thứ gì không phải người.
2. KHÔNG BAO GIỜ dùng các từ: "hệ thống", "chức năng", "tính năng", "AI", "bot", "tự động", "không có tính năng", "chưa được lập trình".
3. Nhắn tin NGẮN GỌN, tự nhiên như đang chat Messenger với bạn bè. KHÔNG viết quá dài, KHÔNG liệt kê quá nhiều.
4. Dùng ngôn ngữ đời thường: "dạ", "nha", "ạ", "luôn", "nhen", "hen". TRÁNH giọng văn cứng nhắc kiểu công sở.
5. Có thể dùng emoji VỪA PHẢI (1-2 emoji/tin). KHÔNG spam emoji.
6. Khi khách hỏi/yêu cầu điều bạn KHÔNG LÀM ĐƯỢC (ví dụ: hủy đơn, đổi trả, kiểm tra vận chuyển...) → KHÔNG NÓI "em không có chức năng". Thay vào đó, trả lời như nhân viên thật:
   - "Dạ anh/chị gửi em mã đơn, em ghi nhận rồi xử lý ngay nha!"
   - "Để em kiểm tra rồi báo lại anh/chị sớm nhất nhen!"
   - "Em ghi nhận lại yêu cầu rồi ạ, em sẽ phản hồi trong ít phút nha!"
   → Luôn THỂ HIỆN sẵn sàng hỗ trợ, KHÔNG THỂ HIỆN giới hạn.
7. KHÔNG mở đầu bằng "Dạ [Tên Shop] xin chào" mỗi lần trả lời. Chỉ chào khi khách MỚI nhắn lần đầu.
====================
TÍNH CÁCH VÀ CHỈ LỆNH:
${systemPrompt || 'Bạn là nhân viên tư vấn bán hàng, hãy trả lời lịch sự, thân thiện, và tập trung chốt đơn.'}
====================
DANH SÁCH SẢN PHẨM CỦA SHOP:
${productCatalog || '(Chưa có danh mục sản phẩm)'}
====================
LỊCH SỬ CHAT:
${historyText}
====================
TIN NHẮN HIỆN TẠI CỦA KHÁCH:
Khách hàng: "${messageText}"${imageData ? `

[KHÁCH GỬI KÈM ẢNH — BẮT BUỘC thực hiện 4 bước sau theo thứ tự:]

BƯỚC 1 — ĐỌC TOÀN BỘ NỘI DUNG ẢNH:
Quét và liệt kê TẤT CẢ thông tin nhìn thấy trong ảnh:
- Mọi văn bản, số, chữ (kể cả mờ, nhỏ, góc ảnh)
- Mã sản phẩm (SKU, mã đơn, barcode, QR code nếu có)
- Tên sản phẩm, thương hiệu, model
- Màu sắc, kích thước, số lượng
- Giá tiền (nếu có ghi trên ảnh)
- Đây là ảnh gì: sản phẩm đơn lẻ / catalogue / hoá đơn / ảnh quảng cáo / ảnh khách hàng chụp?

BƯỚC 2 — ĐỐI CHIẾU VỚI DANH MỤC SẢN PHẨM SHOP:
Từ thông tin đọc được ở Bước 1, tìm trong "DANH SÁCH SẢN PHẨM CỦA SHOP" xem:
- Có sản phẩm nào khớp với mã SKU / tên / mô tả từ ảnh không?
- Nếu KHỚPchính xác → Dùng thông tin giá từ catalog (KHÔNG đoán giá)
- Nếu KHỚP gần đúng (tên tương tự, cùng loại) → Nêu sản phẩm gần nhất và hỏi xác nhận
- Nếu KHÔNG KHỚP → Mô tả sản phẩm trong ảnh và hỏi khách muốn sản phẩm nào trong shop

BƯỚC 3 — HIỂU Ý ĐỊNH KHÁCH:
Kết hợp nội dung ảnh + tin nhắn đi kèm ("${messageText}") để xác định:
- Khách muốn hỏi giá? Đặt mua? So sánh? Khiếu nại?
- Khách hỏi về sản phẩm CỤ THỂ nào trong ảnh (nếu ảnh có nhiều sản phẩm)?

BƯỚC 4 — TRẢ LỜI THEO QUY TẮC BÁN HÀNG:
Dựa trên kết quả 3 bước trên, trả lời tự nhiên theo phong cách nhân viên bán hàng.
CHÚ Ý: Chỉ báo giá khi đã xác định CHÍNH XÁC sản phẩm từ catalog. Không bịa giá.]` : ''}
====================

QUY TẮC BẮT BUỘC:
1. Khi khách ĐỒNG Ý MUA và đã cung cấp ĐỦ: Tên sản phẩm + Số điện thoại + Địa chỉ giao hàng → BẮT BUỘC gọi hàm create_system_order.
2. Nếu khách MUỐN MUA nhưng THIẾU thông tin (chưa có SĐT hoặc chưa có địa chỉ) → GỬI BẢNG TÍNH TIỀN + XIN THÔNG TIN theo mẫu sau. BẮT BUỘC dùng đúng format này:

Dạ em gửi [anh/chị] bảng tính tiền ạ ✨

━━━━━━━━━━━━━━━━━━━━
🧾 BẢNG TÍNH TIỀN
━━━━━━━━━━━━━━━━━━━━
📦 [Tên sản phẩm]
   [Số lượng] x [Đơn giá]đ
────────────────────
   Tạm tính: [Thành tiền]đ
   Ship: [Phí ship / 🎉 Miễn phí]
────────────────────
💰 TỔNG: [Tổng cộng]đ
━━━━━━━━━━━━━━━━━━━━

[Anh/Chị] nhắn giúp em thông tin giao hàng nhé ạ 📦

👤 Tên:
📱 SĐT:
📍 Địa chỉ:

[Câu chốt thân thiện phù hợp sản phẩm, VD: "Em đóng gói cẩn thận rồi gửi ngay cho mình nha! ❤️"]

CHÚ Ý QUAN TRỌNG cho bảng tính tiền:
- Tra cứu giá sản phẩm CHÍNH XÁC từ "DANH SÁCH SẢN PHẨM CỦA SHOP" phía trên. KHÔNG đoán giá.
- Nếu sản phẩm có GIÁ SỈ và khách mua đủ số lượng → Dùng giá sỉ và ghi thêm "(Giá sỉ từ N sp)".
- Phí ship: Xem mục "CÀI ĐẶT PHÍ SHIP" trong danh sách sản phẩm. Dùng phí ship mặc định. Nếu tổng tạm tính >= ngưỡng freeship → ghi "🎉 Miễn phí".
- KHÔNG gọi hàm create_system_order khi chưa có đủ SĐT và Địa chỉ.

3. KHÔNG BAO GIỜ tự bịa ra mã đơn hàng. Chỉ sử dụng mã đơn do hệ thống trả về.
4. Trả lời bằng Tiếng Việt, giọng thân thiện và chuyên nghiệp. Xưng "em" gọi khách "anh/chị/mình" tùy ngữ cảnh.
5. TÊN NGƯỜI NHẬN: Khi khách chốt đơn (đã cung cấp đủ info), bóc tách Tên, SĐT, Địa chỉ từ tin nhắn.
   - Ví dụ: "Ship cho Tuấn, 0912345678, 123 Nguyễn Huệ" → customer_name = "Tuấn".
   - Ví dụ: "Anh Minh lấy 2 hộp, giao 456 Lê Lợi" → customer_name = "Minh".
   - NẾU khách KHÔNG nhắc tên thật trong tin nhắn → customer_name = "${customerName}" (tên Facebook mặc định).
   - TUYỆT ĐỐI KHÔNG để trống customer_name.

QUY TẮC TỰ ĐỘNG PHÂN LOẠI KHÁCH HÀNG (Auto-Tagging):
Bạn có khả năng tự động phân loại khách hàng bằng hàm update_customer_tags. Dựa vào diễn biến hội thoại, BẮT BUỘC gọi hàm này:
- Nếu khách chỉ hỏi giá, tư vấn nhưng chưa mua → Gắn thẻ "Khách tiềm năng" hoặc "Hỏi giá".
- Nếu khách chốt đơn thành công → Gắn thẻ "Đã mua hàng".
- Nếu khách tức giận, phàn nàn → Gắn thẻ "Khiếu nại".
- Nếu khách hỏi về bảo hành, đổi trả → Gắn thẻ "Cần hỗ trợ".
CHÚ Ý: Chỉ gắn thẻ MỚI khi có tín hiệu RÕ RÀNG. Không gắn thẻ cho mỗi tin nhắn. Có thể gắn nhiều thẻ cùng lúc.

KỸ THUẬT UPSELL (BÁN THÊM):
Bạn phải biết cách Upsell. Trong danh sách sản phẩm, nếu sản phẩm có "GIÁ SỈ" đi kèm, hãy chủ động gợi ý:
- Khi khách hỏi mua 1 sản phẩm có mốc giá sỉ → Mời chào: "Dạ giá 1 cái là X đ, nhưng nếu mình lấy N cái thì giá chỉ còn Y đ/cái thôi ạ, mình có muốn lấy luôn N cái không?"
- Chỉ gợi ý Upsell 1 lần, không lặp lại gây phiền.

THỰC THI KỊCH BẢN TIN NHẮN (QUAN TRỌNG):
Trong Kho Kiến Thức, mục nào có [SCRIPT_ID:X] là kịch bản tin nhắn nhiều bước (multi-step) đã soạn sẵn.
Khi khách hỏi về chủ đề CÓ [SCRIPT_ID:X] → BẮT BUỘC gọi execute_bot_script(rule_id=X).
- Hệ thống sẽ TỰ ĐỘNG gửi kịch bản (text + ảnh + delay) cho khách.
- SAU KHI gọi, bạn KHÔNG viết lại nội dung. Chỉ phản hồi ngắn gọn hoặc im lặng.
- Nếu KHÔNG có [SCRIPT_ID] phù hợp → trả lời tự do dựa trên kiến thức.
Ví dụ: Thấy [SCRIPT_ID:6] bên cạnh mục "giá bao nhiêu" → Khách hỏi giá → Gọi execute_bot_script(rule_id=6).

CHÚ Ý VỀ PHONG CÁCH TIN NHẮN:
- Mỗi tin nhắn phải NGẮN GỌN (1-3 câu). Người thật nhắn tin ngắn, không viết essay.
- Nếu KHÔNG có kịch bản phù hợp, trả lời ngắn gọn tự nhiên dựa trên kiến thức.
`;

  const MAX_RETRIES = 1;
  let lastError = null;
  let lastErrorCode = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const retryLabel = attempt > 0 ? ` (RETRY #${attempt})` : '';
      console.log('─'.repeat(60));
      console.log(`[GEMINI AGENTIC]${retryLabel} 🤖 Đang gọi Gemini (Function Calling mode)`);
      console.log(`[GEMINI AGENTIC]   📦 Shop #${shopId} | 👤 Khách #${customerId}`);
      console.log(`[GEMINI AGENTIC]   💬 Tin nhắn: "${messageText.substring(0, 80)}..."`);

      const startTime = Date.now();

      // ★ Step 1: Gửi prompt → Gemini có thể trả text HOẶC functionCall
      const activeAgenticModel = shopApiKey ? getModelsForKey(shopApiKey).agentModel : getModelsForKey(config.gemini.apiKey).agentModel;
      const chatSession = activeAgenticModel.startChat({
        history: [],
      });

      // ★ VISION: Build multipart message nếu có ảnh đính kèm
      let messageParts;
      if (imageData?.base64 && imageData?.mimeType) {
        messageParts = [
          { text: agenticPrompt },
          { inlineData: { mimeType: imageData.mimeType, data: imageData.base64 } },
        ];
        console.log(`[GEMINI AGENTIC] 🖼️ Vision mode: ảnh ${imageData.mimeType} (${Math.round(imageData.base64.length * 0.75 / 1024)}KB)`);
      } else {
        messageParts = agenticPrompt;
      }

      const result = await chatSession.sendMessage(messageParts);
      const response = result.response;
      const elapsed = Date.now() - startTime;

      // ★ Step 2: Kiểm tra xem có Function Call không
      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Bug 4 fix: filter() để xử lý TẤT CẢ function calls (không chỉ cái đầu tiên)
      const functionCallParts = parts.filter(p => p.functionCall);

      if (functionCallParts.length > 0) {
        // ═══════════════════════════════════════
        // AI QUYẾT ĐỊNH GỌI FUNCTION(S)
        // ═══════════════════════════════════════
        console.log(`[GEMINI AGENTIC] 🔧 ${functionCallParts.length} FUNCTION CALL(S) detected sau ${elapsed}ms!`);

        const toolCalls = [];
        const functionResponses = [];

        for (const fcPart of functionCallParts) {
          const fc = fcPart.functionCall;
          console.log(`[GEMINI AGENTIC]   📞 Function: ${fc.name} | Args:`, JSON.stringify(fc.args));

          let toolResult = { success: false, message: 'Unknown tool' };

          if (fc.name === 'create_system_order') {
            toolResult = await executeAIOrder(fc.args, shopId, customerId);
          } else if (fc.name === 'update_customer_tags') {
            toolResult = await executeAITag(fc.args, shopId, customerId);
          } else if (fc.name === 'execute_bot_script') {
            const ruleId = fc.args?.rule_id;
            toolResult = { success: true, message: `Kịch bản #${ruleId} sẽ được hệ thống gửi cho khách.`, rule_id: ruleId };
          }

          toolCalls.push({ name: fc.name, args: fc.args, result: toolResult });
          functionResponses.push({
            functionResponse: {
              name: fc.name,
              response: { result: toolResult.message || JSON.stringify(toolResult) },
            },
          });
        }

        // ★ Step 3: Feed tất cả kết quả về Gemini 1 lần → câu trả lời tự nhiên
        console.log(`[GEMINI AGENTIC] 📤 Gửi ${functionResponses.length} functionResponse(s) về Gemini...`);
        const responseStep2 = await chatSession.sendMessage(functionResponses);

        const finalText = responseStep2.response.text();
        const totalElapsed = Date.now() - startTime;
        console.log(`[GEMINI AGENTIC] ✅ Final response sau ${totalElapsed}ms: "${finalText?.substring(0, 100)}..."`);
        console.log('─'.repeat(60));

        const orderSuccess = toolCalls.some(t => t.name === 'create_system_order' && t.result?.success);
        return {
          intent: orderSuccess ? 'ĐẶT_HÀNG' : 'HỖ_TRỢ',
          reply: finalText,
          toolCalls,
        };

      } else {
        // ═══════════════════════════════════════
        // AI KHÔNG GỌI FUNCTION — Trả text bình thường
        // ═══════════════════════════════════════
        const textResponse = response.text();
        console.log(`[GEMINI AGENTIC] 💬 Text response sau ${elapsed}ms: "${textResponse?.substring(0, 100)}..."`);
        console.log('─'.repeat(60));

        // Parse intent nếu có JSON
        let intent = 'KHÁC';
        let reply = textResponse;
        let confidence = null; // null = không có → parseRAGResponse sẽ dùng heuristic
        let source = 'general';

        // Thử parse JSON nếu trả về JSON format
        try {
          const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.intent) intent = parsed.intent;
            if (parsed.reply) reply = parsed.reply;
            // Bug 2 fix: preserve confidence + source từ RAG response
            if (typeof parsed.confidence === 'number') confidence = parsed.confidence;
            if (parsed.source) source = parsed.source;
          }
        } catch {
          // Không phải JSON → dùng raw text làm reply
          reply = textResponse;
        }

        return { intent, reply, confidence, source, toolCalls: [] };
      }

    } catch (error) {
      lastError = error;
      lastErrorCode = classifyAIError(error);

      console.error('══════════════════════════════════════════');
      console.error(`[GEMINI AGENTIC] ❌ LỖI (Attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
      console.error(`[GEMINI AGENTIC] Error Code: ${lastErrorCode}`);
      console.error(`[GEMINI AGENTIC] Error: ${error.message}`);
      console.error('══════════════════════════════════════════');

      if (attempt < MAX_RETRIES && isRetryable(lastErrorCode)) {
        const delay = 1500 * (attempt + 1);
        console.log(`[GEMINI AGENTIC] 🔄 Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  // Tất cả attempts thất bại
  const errorMessage = getHumanErrorMessage(lastErrorCode);
  console.error(`[GEMINI AGENTIC] 💀 TẤT CẢ ATTEMPTS THẤT BẠI. ErrorCode: ${lastErrorCode}`);
  return {
    intent: 'LỖI',
    reply: null,
    errorCode: lastErrorCode,
    errorMessage,
    toolCalls: [],
  };
};

module.exports = {
  analyzeCustomerMessage,
  advancedAnalyzeMessage,
  agenticAnalyzeMessage,
  AI_ERROR_CODES,
};
