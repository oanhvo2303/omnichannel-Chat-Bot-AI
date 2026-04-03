'use strict';

// Load .env variables FIRST before any other import
require('dotenv').config();

const { analyzeCustomerMessage } = require('./src/services/ai/geminiService');

// =============================================
// Test Script: Giả lập tin nhắn của khách hàng
// =============================================

const customerMessage =
  'Shop ơi, đôi giày sneaker mã SP01 màu đen còn size 42 không? ' +
  'Ship về Hà Nội thì mấy ngày tới và phí ship bao nhiêu?';

console.log('============================================');
console.log('  TEST: Agent B - Gemini AI Brain');
console.log('============================================');
console.log(`  Tin nhắn giả lập: "${customerMessage}"`);
console.log('  Đang gọi Gemini...\n');

(async () => {
  const result = await analyzeCustomerMessage(customerMessage);

  console.log('--- KẾT QUẢ PHÂN TÍCH ---');
  console.log(`  Ý định (Intent) : ${result.intent}`);
  console.log(`  Trả lời (Reply) : ${result.reply}`);
  console.log('============================================');
})();
