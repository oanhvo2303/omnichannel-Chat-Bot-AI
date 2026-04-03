'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config');

// =============================================
// Gemini AI Service — Agent B (Não bộ AI)
// Enhanced: Error Classification + Retry + Mega Tracing
// =============================================

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

/**
 * Text-only model — dùng cho legacy + trường hợp AI chỉ chat.
 */
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.3,
    maxOutputTokens: 1024,
  },
});

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
    ],
  },
];

const agenticModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: ORDER_TOOL_DECLARATIONS,
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 2048,
  },
});


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
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    console.log(`[GEMINI LEGACY] ✅ API trả về sau ${Date.now() - startTime}ms. Raw: ${responseText.substring(0, 200)}`);

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) responseText = jsonMatch[0];
    else throw new Error('AI không nhả JSON hợp lệ: ' + responseText);

    const parsed = JSON.parse(responseText);
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
      const result = await model.generateContent(prompt);
      let responseText = result.response.text();
      const elapsed = Date.now() - startTime;

      console.log(`[GEMINI ADV] ✅ API trả về sau ${elapsed}ms. Raw: ${responseText.substring(0, 200)}`);

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) responseText = jsonMatch[0];
      else throw new Error('AI không nhả JSON hợp lệ: ' + responseText);

      const parsed = JSON.parse(responseText);
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
const agenticAnalyzeMessage = async (messageText, systemPrompt, history, context = {}, productCatalog = '') => {
  const { shopId = 'N/A', customerId = 'N/A', customerName = 'Khách hàng' } = context;
  const { executeAIOrder } = require('./orderExecutor');
  const { executeAITag } = require('./tagExecutor');

  let historyText = history.map(h => `${h.sender === 'customer' ? 'Khách hàng' : 'Nhân viên/AI'}: "${h.text}"`).join('\n');
  if (!historyText) historyText = '(Chưa có lịch sử chat trước đó)';

  const agenticPrompt = `
Bạn là một nhân viên Sale chuyên nghiệp đại diện cho cửa hàng.
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
Khách hàng: "${messageText}"
====================

QUY TẮC BẮT BUỘC:
1. Khi khách ĐỒNG Ý MUA và đã cung cấp ĐỦ: Tên sản phẩm + Số điện thoại + Địa chỉ giao hàng → BẮT BUỘC gọi hàm create_system_order.
2. Nếu THIẾU thông tin (chưa có SĐT hoặc chưa có địa chỉ) → HỎI LẠI khách một cách tự nhiên, KHÔNG gọi hàm.
3. KHÔNG BAO GIỜ tự bịa ra mã đơn hàng. Chỉ sử dụng mã đơn do hệ thống trả về.
4. Trả lời bằng Tiếng Việt, giọng thân thiện và chuyên nghiệp.
5. TÊN NGƯỜI NHẬN: Khi khách chốt đơn, bóc tách Tên, SĐT, Địa chỉ từ tin nhắn.
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
      const chatSession = agenticModel.startChat({
        history: [],
      });

      const result = await chatSession.sendMessage(agenticPrompt);
      const response = result.response;
      const elapsed = Date.now() - startTime;

      // ★ Step 2: Kiểm tra xem có Function Call không
      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      const functionCallPart = parts.find(p => p.functionCall);

      if (functionCallPart) {
        // ═══════════════════════════════════════
        // AI QUYẾT ĐỊNH GỌI FUNCTION
        // ═══════════════════════════════════════
        const fc = functionCallPart.functionCall;
        console.log(`[GEMINI AGENTIC] 🔧 FUNCTION CALL detected sau ${elapsed}ms!`);
        console.log(`[GEMINI AGENTIC]   📞 Function: ${fc.name}`);
        console.log(`[GEMINI AGENTIC]   📋 Args:`, JSON.stringify(fc.args));

        let toolResult = { success: false, message: 'Unknown tool' };
        const toolCalls = [];

        if (fc.name === 'create_system_order') {
          // Execute tạo đơn thật
          toolResult = await executeAIOrder(fc.args, shopId, customerId);
          toolCalls.push({
            name: fc.name,
            args: fc.args,
            result: toolResult,
          });
        } else if (fc.name === 'update_customer_tags') {
          // Execute gắn/gỡ thẻ khách hàng
          toolResult = await executeAITag(fc.args, shopId, customerId);
          toolCalls.push({
            name: fc.name,
            args: fc.args,
            result: toolResult,
          });
        }

        // ★ Step 3: Feed kết quả trở lại Gemini để sinh câu phản hồi tự nhiên
        console.log(`[GEMINI AGENTIC] 📤 Gửi functionResponse trở lại Gemini...`);
        const responseStep2 = await chatSession.sendMessage([
          {
            functionResponse: {
              name: fc.name,
              response: {
                result: toolResult.message || JSON.stringify(toolResult),
              },
            },
          },
        ]);

        const finalText = responseStep2.response.text();
        const totalElapsed = Date.now() - startTime;

        console.log(`[GEMINI AGENTIC] ✅ Final response sau ${totalElapsed}ms: "${finalText?.substring(0, 100)}..."`);
        console.log('─'.repeat(60));

        return {
          intent: toolResult.success ? 'ĐẶT_HÀNG' : 'HỖ_TRỢ',
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

        // Thử parse JSON nếu trả về JSON format
        try {
          const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.intent) intent = parsed.intent;
            if (parsed.reply) reply = parsed.reply;
          }
        } catch {
          // Không phải JSON → dùng raw text làm reply
          reply = textResponse;
        }

        return { intent, reply, toolCalls: [] };
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
