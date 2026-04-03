'use strict';

const config = require('../../config');
const { analyzeCustomerMessage, advancedAnalyzeMessage, agenticAnalyzeMessage, AI_ERROR_CODES } = require('../../services/ai/geminiService');
const crypto = require('crypto');
const { getDB } = require('../../infra/database/sqliteConnection');
const { getIO } = require('../../infra/socket/socketManager');
const { sendCapiEvent } = require('../../services/facebookCapiService');

// =============================================
// Regex phát hiện SĐT Việt Nam (để auto-hide comment)
// =============================================
const PHONE_REGEX = /(?:\+84|0)(?:\s?\.?-?){0,1}(?:3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d/;

/**
 * GET /webhook/facebook — Verification handshake
 */
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.facebook.verifyToken) {
    console.log('[FB WEBHOOK] Verification successful.');
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'Forbidden: Token mismatch.' });
};

/**
 * Gửi tin nhắn qua Facebook Send API (Inbox)
 */
const callSendAPI = async (recipientId, text, pageAccessToken) => {
  if (!pageAccessToken) return;
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    });
    const data = await response.json();
    if (!response.ok) console.error('[FB SEND] Lỗi:', data.error?.message);
    else console.log(`[FB SEND] Reply inbox → ${recipientId}`);
  } catch (error) {
    console.error('[FB SEND] Network error:', error.message);
  }
};

/**
 * Reply comment trên Facebook bằng Graph API
 */
const replyToComment = async (commentId, text, pageAccessToken) => {
  if (!pageAccessToken) return;
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${commentId}/comments?access_token=${pageAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    const data = await response.json();
    if (!response.ok) console.error('[FB COMMENT REPLY] Lỗi:', data.error?.message);
    else console.log(`[FB COMMENT REPLY] Reply → comment ${commentId}`);
  } catch (error) {
    console.error('[FB COMMENT REPLY] Error:', error.message);
  }
};

/**
 * Ẩn comment bằng Graph API (is_hidden: true)
 */
const hideComment = async (commentId, pageAccessToken) => {
  if (!pageAccessToken) return false;
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${commentId}?access_token=${pageAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_hidden: true }),
    });
    const data = await response.json();
    if (data.success) {
      console.log(`[FB AUTO-HIDE] ✅ Ẩn comment ${commentId} (chứa SĐT)`);
      return true;
    }
    console.error('[FB AUTO-HIDE] Lỗi:', JSON.stringify(data));
    return false;
  } catch (error) {
    console.error('[FB AUTO-HIDE] Error:', error.message);
    return false;
  }
};

/**
 * Gửi tin nhắn riêng (Private Reply) cho người comment
 */
const sendPrivateReply = async (commentId, text, pageAccessToken) => {
  if (!pageAccessToken) return;
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text },
      }),
    });
    const data = await response.json();
    if (!response.ok) console.error('[FB PRIVATE REPLY] Lỗi:', data.error?.message);
    else console.log(`[FB PRIVATE REPLY] Nhắn riêng → comment ${commentId}`);
  } catch (error) {
    console.error('[FB PRIVATE REPLY] Error:', error.message);
  }
};

/**
 * POST /webhook/facebook — Nhận event từ Facebook (Messages + Comments)
 */
const handleIncomingEvent = (req, res) => {
  const body = req.body;
  res.status(200).json({ status: 'EVENT_RECEIVED' });

  if (body.object !== 'page') return;

  body.entry?.forEach((entry) => {
    const pageId = entry.id;

    // ========== INBOX MESSAGES ==========
    entry.messaging?.forEach((event) => {
      const senderId = event.sender?.id;
      if (!senderId) return;

      let messageText = event.message?.text;

      // ★ [QA FIX] Handle media messages (ảnh, sticker, video, audio)
      if (!messageText && event.message?.attachments?.length > 0) {
        const att = event.message.attachments[0];
        const typeMap = { image: 'Ảnh', video: 'Video', audio: 'Audio', file: 'File', fallback: 'Link' };
        const label = typeMap[att.type] || att.type;
        messageText = `[${label}] ${att.payload?.url || ''}`;
      }

      if (!messageText) return; // postback hoặc event lạ → bỏ qua an toàn

      console.log(`[FB INBOX] Page ${pageId} | From ${senderId}: "${messageText.substring(0, 120)}"`);
      processInboxMessage(pageId, senderId, messageText);
    });

    // ========== FEED COMMENTS ==========
    entry.changes?.forEach((change) => {
      if (change.field !== 'feed') return;
      const value = change.value;
      if (value.item !== 'comment' || value.verb !== 'add') return;

      // Bỏ qua comment của chính Page
      if (value.from?.id === pageId) return;

      const commentId = value.comment_id;
      const senderId = value.from?.id;
      const senderName = value.from?.name;
      const commentText = value.message;
      const postId = value.post_id;

      console.log(`[FB COMMENT] Page ${pageId} | ${senderName} (${senderId}): "${commentText}" on post ${postId}`);
      processComment(pageId, senderId, senderName, commentText, commentId, postId);
    });
  });
};

/**
 * Tự động thu thập Profile của Khách từ Facebook API
 */
async function getOrCreateCustomer(db, shop, senderId, pageId, providedName = null) {
  let customer = await db.get('SELECT id, assigned_to, name, avatar_url, is_ai_paused FROM Customers WHERE shop_id = ? AND platform_id = ? AND platform = ?', [shop.id, senderId, 'facebook']);
  
  if (!customer) {
    let fullName = providedName || `Khách #${senderId.slice(-4)}`;
    let avatarUrl = null;

    try {
      const fbUrl = `https://graph.facebook.com/v21.0/${senderId}?fields=first_name,last_name,profile_pic&access_token=${shop.page_access_token}`;
      
      // CHE TOKEN (Chỉ hiển thị 10 ký tự cuối)
      const maskedToken = shop.page_access_token ? `***${shop.page_access_token.slice(-10)}` : 'NULL';
      console.log(`[DEBUG FB PROFILE] Calling: https://graph.facebook.com/v21.0/${senderId}?fields=first_name,last_name,profile_pic&access_token=${maskedToken}`);

      const profileRes = await fetch(fbUrl);
      const profile = await profileRes.json();
      
      console.log(`[DEBUG FB PROFILE] Response from Meta:`, JSON.stringify(profile));

      if (profileRes.ok && !profile.error) {
        // Chuẩn Việt Nam: Họ (last_name) + Tên (first_name)
        const apiName = [profile.last_name, profile.first_name].filter(Boolean).join(' ');
        if (apiName) fullName = apiName;
        if (profile.profile_pic) avatarUrl = profile.profile_pic;
        console.log(`[FB PROFILE] Đã thu thập thành công Name & Avatar: ${fullName}`);
      } else {
         console.warn(`[FB PROFILE ERROR] Graph API trả về lỗi hoặc thiếu quyền:`, profile.error);
      }
    } catch (err) {
      console.error(`[FB PROFILE FATAL ERROR] Lệch mạng hoặc fetch() sập:`, err.message);
    }

    const res = await db.run(
      'INSERT INTO Customers (shop_id, platform_id, platform, page_id, name, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      [shop.id, senderId, 'facebook', pageId, fullName, avatarUrl]
    );

    customer = { id: res.lastID, name: fullName, avatar_url: avatarUrl, assigned_to: null, is_ai_paused: 0 };
  } else if (!customer.avatar_url || !customer.name || customer.name.includes('Khách #')) {
    // Tự động update nếu có tên thật hoặc thiếu avatar
    let fullName = providedName || customer.name;
    let avatarUrl = customer.avatar_url;
    let needsUpdate = false;

    if (!avatarUrl || !fullName || fullName?.includes('Khách #')) {
      try {
        const maskedToken = shop.page_access_token ? `***${shop.page_access_token.slice(-10)}` : 'NULL';
        const url = `https://graph.facebook.com/v21.0/${senderId}?fields=first_name,last_name,profile_pic&access_token=${shop.page_access_token}`;
        console.log(`[DEBUG FB PROFILE] Khách đã có trên DB nhưng thiếu Info. Gọi lại Graph API đoạn PSID: ${senderId}`);
        
        const profileRes = await fetch(url);
        const profile = await profileRes.json();
        
        console.log(`[DEBUG FB PROFILE] Response from Meta:`, JSON.stringify(profile));

        if (profileRes.ok && !profile.error) {
           // Chuẩn Việt Nam: Họ (last_name) + Tên (first_name)
           const apiName = [profile.last_name, profile.first_name].filter(Boolean).join(' ');
           if (apiName && (!fullName || fullName?.includes('Khách #'))) {
              fullName = apiName;
              needsUpdate = true;
           }
           if (profile.profile_pic && !avatarUrl) {
              avatarUrl = profile.profile_pic;
              needsUpdate = true;
           }
           console.log(`[FB PROFILE] Đã thu thập BỔ SUNG Name & Avatar: ${fullName}`);
        } else {
           const errMsg = `[FB PROFILE ERROR] Graph API fail: ${JSON.stringify(profile.error || profile)}`;
           console.error(errMsg);

           // Bất chấp Meta lỗi, phải Heal Database tránh null name vĩnh viễn
           if (!fullName) {
             fullName = `Khách #${senderId.slice(-4)}`;
             needsUpdate = true;
           }
        }
      } catch (err) {
        console.error(`[FB PROFILE FATAL ERROR] Lỗi thu thập bổ sung:`, err.message);
        if (!fullName) { fullName = `Khách #${senderId.slice(-4)}`; needsUpdate = true; }
      }
    }

    if (needsUpdate) {
      console.log(`[DEBUG FB PROFILE] Thực thi UPDATE Database cho KH: ${customer.id} -> Tên: ${fullName}`);
      await db.run('UPDATE Customers SET name = ?, avatar_url = ? WHERE id = ?', [fullName, avatarUrl, customer.id]);
      customer.name = fullName;
      customer.avatar_url = avatarUrl;
    }
  }

  return customer;
}

/**
 * Pipeline xử lý tin nhắn Inbox (giữ nguyên logic cũ)
 */
async function processInboxMessage(pageId, senderId, messageText) {
  const pipelineStart = Date.now();
  console.log('═'.repeat(70));
  console.log(`[INBOX PIPELINE] 🚀 BẮT ĐẦU XỬ LÝ TIN NHẮN MỚI`);
  console.log(`[INBOX PIPELINE]   📄 Page ID    : ${pageId}`);
  console.log(`[INBOX PIPELINE]   👤 Sender ID  : ${senderId}`);
  console.log(`[INBOX PIPELINE]   💬 Nội dung   : "${messageText?.substring(0, 120)}"`);
  console.log(`[INBOX PIPELINE]   🕐 Thời gian  : ${new Date().toISOString()}`);
  console.log('═'.repeat(70));

  try {
    const db = getDB();
    const io = getIO();

    // Nâng cấp Module 3: Truy vấn bảng ShopIntegrations để tìm page_id này thuộc shop nào
    // Hỗ trợ Multi-Page: Dùng LIKE thay vì '=' để match được platform 'facebook_pageId'
    const integration = await db.get(
      "SELECT shop_id, access_token, is_ai_active, ai_system_prompt FROM ShopIntegrations WHERE page_id = ? AND platform LIKE 'facebook%' AND status = 'connected'",
      [pageId]
    );
    if (!integration) {
      console.warn(`[INBOX PIPELINE] ⛔ Bỏ qua tin nhắn — Page ${pageId} không thuộc hệ thống (không có integration connected).`);
      return; 
    }
    const shop = { 
      id: integration.shop_id, 
      page_access_token: integration.access_token,
      is_ai_active: integration.is_ai_active,
      ai_system_prompt: integration.ai_system_prompt
    };
    console.log(`[AI TRACE] ✅ Tìm thấy Shop #${shop.id} | is_ai_active = ${shop.is_ai_active} (${shop.is_ai_active === 1 ? 'BẬT' : 'TẮT'}) | has_system_prompt = ${!!shop.ai_system_prompt}`);

    const customer = await getOrCreateCustomer(db, shop, senderId, pageId);
    if (!customer) return;

    // Round-Robin: gán khách mới cho Staff
    if (!customer.assigned_to) {
      const { assignCustomerRoundRobin } = require('../services/routingService');
      await assignCustomerRoundRobin(shop.id, customer.id);
    }

    const msgResult = await db.run(
      'INSERT INTO Messages (shop_id, customer_id, sender, text, type, page_id) VALUES (?, ?, ?, ?, ?, ?)',
      [shop.id, customer.id, 'customer', messageText, 'inbox', pageId]
    );

    if (io) {
      // BẮT BUỘC: Chỉ phát sự kiện cho một phòng riêng (Room) mang id của Shop để chống leak dữ liệu chéo
      io.to(String(shop.id)).emit('new_message', {
        id: msgResult.lastID, shop_id: shop.id, customer_id: customer.id,
        sender: 'customer', text: messageText, type: 'inbox', intent: null,
        page_id: pageId, customer_name: customer.name || `Khách #${senderId.slice(-4)}`,
        avatar_url: customer.avatar_url,
        timestamp: new Date().toISOString(),
      });
    }

    // ★★★ TÍNH NĂNG SÁT THỦ: Auto-extract SĐT bằng Regex ★★★
    const phoneRegex = /(?<!\d)(0[1-9]\d{8})(?!\d)/g;
    const phonesFound = messageText.match(phoneRegex);
    if (phonesFound && phonesFound.length > 0) {
      const extractedPhone = phonesFound[0]; // Lấy số đầu tiên tìm thấy
      // Chỉ cập nhật nếu khách chưa có SĐT
      const currentCustomer = await db.get('SELECT phone FROM Customers WHERE id = ?', [customer.id]);
      if (!currentCustomer?.phone) {
        await db.run('UPDATE Customers SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?', [extractedPhone, customer.id, shop.id]);
        console.log(`[CRM REGEX] 📱 Auto-extract SĐT: ${extractedPhone} → Khách #${customer.id} (${customer.name})`);
        
        // 🚀 Bắn CAPI Event (Lead) - KHÔNG await để luồng webhook chạy tiếp
        sendCapiEvent({
          shopId: shop.id,
          eventName: 'Lead',
          phone: extractedPhone,
          eventId: crypto.randomUUID()
        }).catch(err => console.error('[CAPI Trigger] Regex Error:', err.message));

        // Bắn Socket để UI tự điền
        if (io) {
          io.to(String(shop.id)).emit('customer_phone_extracted', {
            customer_id: customer.id,
            phone: extractedPhone,
            source: 'auto_regex',
          });
        }
      }
    }

    // ★ Step 1: Check Keyword Bot Rules FIRST (tiết kiệm API Gemini)
    const rules = await db.all('SELECT * FROM BotRules WHERE shop_id = ? AND is_active = 1', [shop.id]);
    let keywordReply = null;
    let keywordReplyType = 'text';
    let keywordMediaUrl = null;
    let matchedRule = null;

    const lowerText = messageText.toLowerCase();
    for (const rule of rules) {
      const keywords = rule.keywords.split(',').map((k) => k.trim().toLowerCase());
      let matched = false;

      for (const kw of keywords) {
        if (!kw) continue;
        if (rule.match_type === 'exact' && lowerText === kw) matched = true;
        else if (rule.match_type === 'startswith' && lowerText.startsWith(kw)) matched = true;
        else if (rule.match_type === 'contains' && lowerText.includes(kw)) matched = true;
        if (matched) break;
      }

      if (matched) {
        matchedRule = rule;
        keywordReply = rule.response;
        keywordReplyType = rule.response_type || 'text';
        keywordMediaUrl = rule.media_url || null;
        console.log(`[BOT RULES] ✅ Match "${rule.keywords}" → ${rule.steps ? 'MULTI-STEP' : 'single reply'} (skip AI)`);
        break;
      }
    }

    let replyText, replyIntent;

    if (matchedRule) {
      // ★ Keyword match: trả lời ngay, không gọi Gemini
      replyIntent = 'keyword_rule';

      // ═══════════════════════════════════════════
      // MULTI-STEP: Gửi tuần tự qua Background Executor
      // ═══════════════════════════════════════════
      let parsedSteps = null;
      try { parsedSteps = matchedRule.steps ? JSON.parse(matchedRule.steps) : null; } catch { parsedSteps = null; }

      if (parsedSteps && Array.isArray(parsedSteps) && parsedSteps.length > 0) {
        const { executeBotSteps } = require('../../services/bot/botStepExecutor');
        replyText = parsedSteps[0]?.text || '[Multi-step Script]';

        // ★★★ FIRE-AND-FORGET: Không await, không block webhook ★★★
        executeBotSteps({
          steps: parsedSteps,
          senderId,
          pageAccessToken: shop.page_access_token,
          shopId: shop.id,
          customerId: customer.id,
          io,
          ruleKeyword: matchedRule.keywords,
        }).catch((err) => {
          console.error('[BOT STEP] ❌ Background executor crash:', err.message);
        });

        // Skip normal message save — botStepExecutor tự lưu mỗi step
        console.log(`[INBOX PIPELINE] ⏱️ Pipeline kết thúc sau ${Date.now() - pipelineStart}ms (multi-step fire-and-forget)`);
        return;

      } else if (keywordReplyType === 'image' && keywordMediaUrl) {
        // ★ LEGACY: Gửi ảnh đơn lẻ
        replyText = `[Ảnh] ${keywordMediaUrl}`;
        try {
          const imgPayload = {
            recipient: { id: senderId },
            message: {
              attachment: {
                type: 'image',
                payload: { url: keywordMediaUrl, is_reusable: true },
              },
            },
          };
          const imgRes = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${shop.page_access_token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(imgPayload),
          });
          const imgData = await imgRes.json();
          if (!imgRes.ok) {
            console.error('[BOT RULES] ❌ Lỗi gửi ảnh:', imgData.error?.message);
          } else {
            console.log(`[BOT RULES] 🖼️ Gửi ảnh → ${senderId}: ${keywordMediaUrl}`);
          }
        } catch (imgErr) {
          console.error('[BOT RULES] ❌ Lỗi gửi ảnh:', imgErr.message);
        }

        // Nếu có text kèm theo (response field), gửi thêm text
        if (keywordReply && keywordReply.trim() && keywordReply !== keywordMediaUrl) {
          await callSendAPI(senderId, keywordReply, shop.page_access_token);
          replyText = keywordReply;
        }
      } else {
        // ★ LEGACY: Text response đơn lẻ
        replyText = keywordReply;
        await callSendAPI(senderId, replyText, shop.page_access_token);
      }
    } else {
      // ★ Step 2: Không trúng từ khóa → Kiểm tra có bật AI không
      console.log(`[AI TRACE] ────────────────────────────────────────`);
      console.log(`[AI TRACE] 🔍 Không match keyword nào. KIỂM TRA CÔNG TẮC AI...`);
      console.log(`[AI TRACE]   📊 shop.is_ai_active   = ${shop.is_ai_active} (type: ${typeof shop.is_ai_active}) → ${shop.is_ai_active === 1 ? '✅ BẬT' : '❌ TẮT'}`);
      console.log(`[AI TRACE]   📊 customer.is_ai_paused = ${customer.is_ai_paused} (type: ${typeof customer.is_ai_paused}) → ${customer.is_ai_paused === 1 ? '⏸️ TẠM DỪNG' : '▶️ ĐANG CHẠY'}`);
      console.log(`[AI TRACE] ────────────────────────────────────────`);

      if (shop.is_ai_active === 1) {
        if (customer.is_ai_paused === 1) {
          console.log(`[AI TRACE] 🛑 AI BỊ CHẶN: Khách #${customer.id} (${customer.name}) đang bị khóa AI (is_ai_paused=1). Sale chat tay.`);
          console.log(`[INBOX PIPELINE] ⏱️ Pipeline kết thúc sau ${Date.now() - pipelineStart}ms (AI paused for customer)`);
          return;
        }

        // Lấy 5 tin nhắn gần nhất làm context
        const historyRows = await db.all(
          "SELECT sender, text FROM Messages WHERE customer_id = ? ORDER BY timestamp DESC LIMIT 10",
          [customer.id]
        );
        historyRows.reverse();

        // ★ Inject danh sách sản phẩm vào prompt để AI biết shop bán gì
        const products = await db.all(
          'SELECT name, price, stock_quantity, sku, volume_pricing FROM Products WHERE shop_id = ? AND stock_quantity > 0',
          [shop.id]
        );
        const productCatalog = products.length > 0
          ? products.map(p => {
              let line = `- ${p.name} (${p.sku || 'N/A'}): ${p.price?.toLocaleString()}đ — Còn ${p.stock_quantity} sp`;
              // Inject volume pricing tiers
              if (p.volume_pricing) {
                try {
                  const tiers = JSON.parse(p.volume_pricing);
                  if (Array.isArray(tiers) && tiers.length > 0) {
                    const tierStr = tiers.map(t => `mua ≥${t.min_qty} cái: ${t.price.toLocaleString()}đ/sp`).join(', ');
                    line += ` | GIÁ SỈ: ${tierStr}`;
                  }
                } catch {}
              }
              return line;
            }).join('\n')
          : '(Chưa có sản phẩm trong kho)';

        // ═══ AI QUOTA ENFORCEMENT ═══
        const shopLicense = await db.get('SELECT license_status, ai_quota_limit, ai_messages_used FROM Shops WHERE id = ?', [shop.id]);
        if (shopLicense && shopLicense.license_status !== 'ACTIVE' && shopLicense.license_status !== 'TRIAL') {
          console.log(`[AI] ⛔ Shop #${shop.id} license=${shopLicense.license_status} — AI disabled`);
          replyText = 'Xin lỗi, hệ thống chatbot tạm thời không khả dụng. Vui lòng liên hệ chủ shop.';
        } else if (shopLicense && shopLicense.ai_messages_used >= shopLicense.ai_quota_limit) {
          console.log(`[AI] ⛔ Shop #${shop.id} quota exceeded: ${shopLicense.ai_messages_used}/${shopLicense.ai_quota_limit}`);
          replyText = 'Xin lỗi, hệ thống chatbot tạm thời bận. Nhân viên sẽ hỗ trợ bạn sớm nhất!';
        } else {
          console.log(`[AI TRACE] 🤖 Gọi Gemini AGENTIC cho Khách #${customer.id} (${customer.name}) | History: ${historyRows.length} msgs | Products: ${products.length} | Quota: ${shopLicense?.ai_messages_used || 0}/${shopLicense?.ai_quota_limit || 0}`);
          const analysis = await agenticAnalyzeMessage(messageText, shop.ai_system_prompt, historyRows, { shopId: shop.id, customerId: customer.id, customerName: customer.name }, productCatalog);
          replyText = analysis.reply;
          replyIntent = analysis.intent;

          // Increment AI usage counter
          await db.run('UPDATE Shops SET ai_messages_used = ai_messages_used + 1 WHERE id = ?', [shop.id]);

        // ★★★ Xử lý Tool Calls — AI tự tạo đơn hàng + Auto-tagging ★★★
        if (analysis.toolCalls?.length > 0) {
          for (const call of analysis.toolCalls) {
            if (call.name === 'create_system_order' && call.result?.success) {
              console.log(`[AI TRACE] 🎉 AI TỰ TẠO ĐƠN THÀNH CÔNG: Đơn #${call.result.orderId} — ${call.result.totalAmount?.toLocaleString()}đ`);

              // Emit Socket event cho Dashboard
              if (io) {
                io.to(String(shop.id)).emit('ai_order_created', {
                  order_id: call.result.orderId,
                  customer_id: customer.id,
                  customer_name: customer.name || `Khách #${senderId.slice(-4)}`,
                  total_amount: call.result.totalAmount,
                  product_name: call.result.productName,
                  quantity: call.result.quantity,
                  timestamp: new Date().toISOString(),
                });
                console.log(`[AI TRACE] 📡 Đã emit 'ai_order_created' → Dashboard (Room: Shop #${shop.id})`);
              }
            }

            // ★★★ AUTO-TAGGING: AI tự gắn thẻ khách hàng ★★★
            if (call.name === 'update_customer_tags' && call.result?.success) {
              const tagNames = call.result.tagNames || [];
              const tagAction = call.result.action || 'add';
              console.log(`[AI TRACE] 🏷️ AI AUTO-TAG: ${tagAction} [${tagNames.join(', ')}] → Khách #${customer.id}`);

              // Emit Socket event cho Dashboard real-time update
              if (io) {
                io.to(String(shop.id)).emit('customer_tags_updated', {
                  customer_id: customer.id,
                  action: tagAction,
                  tags: call.result.tags || [],
                  tag_names: tagNames,
                  source: 'ai_auto',
                  timestamp: new Date().toISOString(),
                });
                console.log(`[AI TRACE] 📡 Đã emit 'customer_tags_updated' → Dashboard (Room: Shop #${shop.id})`);
              }

              // ★ Lưu system message trong chat để Sale biết AI đã gắn thẻ
              const tagLabel = tagNames.map(t => `[${t}]`).join(' ');
              const systemMsg = tagAction === 'add'
                ? `🤖 AI đã tự động gắn thẻ: ${tagLabel}`
                : `🤖 AI đã gỡ thẻ: ${tagLabel}`;

              const sysResult = await db.run(
                'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, intent, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [shop.id, customer.id, 'bot', 'system', systemMsg, 'auto_tag', 'inbox']
              );

              // Emit system message qua Socket cho chat window
              if (io) {
                io.to(String(shop.id)).emit('new_message', {
                  id: sysResult.lastID,
                  shop_id: shop.id,
                  customer_id: customer.id,
                  sender: 'bot',
                  sender_type: 'system',
                  text: systemMsg,
                  intent: 'auto_tag',
                  type: 'inbox',
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
        }

        // ★★★ BUG FIX CRITICAL: Khi AI LỖI → KHÔNG gửi tin cho khách ★★★
        if (replyIntent === 'LỖI' || !replyText) {
          console.error('═'.repeat(60));
          console.error(`[AI TRACE] 🚨🚨🚨 AI LỖI — KHÔNG GỬI TIN CHO KHÁCH 🚨🚨🚨`);
          console.error(`[AI TRACE] ErrorCode: ${analysis.errorCode || 'UNKNOWN'}`);
          console.error(`[AI TRACE] ErrorMessage: ${analysis.errorMessage || 'N/A'}`);
          console.error(`[AI TRACE] Shop #${shop.id} | Khách #${customer.id} (${customer.name})`);
          console.error('═'.repeat(60));

          // ★ Emit lỗi lên Dashboard để Shop Owner biết mà xử lý
          if (io) {
            io.to(String(shop.id)).emit('ai_error', {
              customer_id: customer.id,
              customer_name: customer.name || `Khách #${senderId.slice(-4)}`,
              error_code: analysis.errorCode || 'UNKNOWN',
              error_message: analysis.errorMessage || 'AI gặp lỗi không xác định.',
              original_message: messageText.substring(0, 200),
              timestamp: new Date().toISOString(),
            });
            console.log(`[AI TRACE] 📡 Đã emit 'ai_error' event lên Dashboard (Room: Shop #${shop.id})`);
          }

          console.log(`[INBOX PIPELINE] ⏱️ Pipeline kết thúc sau ${Date.now() - pipelineStart}ms (AI ERROR — không gửi FB)`);
          return; // DỪNG — không gửi tin cho khách, không lưu bot message
        }
        } // end else (AI quota OK)

        console.log(`[AI TRACE] ✅ AI trả lời thành công: Intent=${replyIntent} | Reply="${replyText?.substring(0, 60)}..."`);
        await callSendAPI(senderId, replyText, shop.page_access_token);
      } else {
        // AI không tự động chạy, chỉ lưu tin nhắn vào để Sale đọc
        console.log(`[AI TRACE] 🚫 AI KHÔNG CHẠY: shop.is_ai_active = ${shop.is_ai_active} (OFF). Chỉ lưu tin nhắn để Sale đọc.`);
        console.log(`[INBOX PIPELINE] ⏱️ Pipeline kết thúc sau ${Date.now() - pipelineStart}ms (AI OFF)`);
        return;
      }
    }

    // ★ Lưu tin nhắn bot vào DB + Socket.IO với sender_type = bot AI
    const botResult = await db.run(
      'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, intent, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [shop.id, customer.id, 'bot', 'bot', replyText, replyIntent, 'inbox']
    );

    if (io) {
      // Webhook Bot emit cũng trói vào Room
      io.to(String(shop.id)).emit('new_message', {
        id: botResult.lastID, shop_id: shop.id, customer_id: customer.id,
        sender: 'bot', sender_type: 'bot', text: replyText, intent: replyIntent, type: 'inbox',
        timestamp: new Date().toISOString(),
      });
    }
    console.log(`[INBOX PIPELINE] ⏱️ Pipeline hoàn thành sau ${Date.now() - pipelineStart}ms ✅`);
  } catch (error) {
    console.error('═'.repeat(70));
    console.error('[INBOX PIPELINE] ❌❌❌ LỖI NGHIÊM TRỌNG TRONG LUỒNG XỬ LÝ TIN NHẮN ❌❌❌');
    console.error('[INBOX PIPELINE]   Page ID   :', pageId);
    console.error('[INBOX PIPELINE]   Sender ID :', senderId);
    console.error('[INBOX PIPELINE]   Message   :', messageText?.substring(0, 120));
    console.error('[INBOX PIPELINE]   Error Name:', error.name);
    console.error('[INBOX PIPELINE]   Error Msg :', error.message);
    console.error('[INBOX PIPELINE]   Full Stack:', error.stack);
    console.error('[INBOX PIPELINE]   Elapsed   :', Date.now() - pipelineStart, 'ms');
    console.error('═'.repeat(70));

    // Emit lỗi pipeline lên Dashboard
    try {
      const io = getIO();
      if (io) {
        // Không biết shop_id ở đây nên broadcast cho tất cả
        io.emit('ai_error', {
          error_code: 'PIPELINE_CRASH',
          error_message: `Lỗi nghiêm trọng trong xử lý tin nhắn: ${error.message}`,
          original_message: messageText?.substring(0, 200),
          timestamp: new Date().toISOString(),
        });
      }
    } catch { /* không để emit lỗi crash thêm */ }
  }
}

/**
 * Pipeline xử lý Comment (+ auto-hide SĐT)
 */
async function processComment(pageId, senderId, senderName, commentText, commentId, postId) {
  try {
    const db = getDB();
    const io = getIO();

    // Tương tự, tra cứu comment qua ShopIntegrations
    const integration = await db.get(
      "SELECT shop_id, access_token, auto_hide_comments FROM ShopIntegrations WHERE page_id = ? AND platform = 'facebook' AND status = 'connected'",
      [pageId]
    );
    if (!integration) return;
    const shop = { id: integration.shop_id, page_access_token: integration.access_token };

    // Upsert customer & Tự động gọi FB Profile
    const customer = await getOrCreateCustomer(db, shop, senderId, pageId, senderName);
    if (!customer) return;

    // Round-Robin: gán khách mới cho Staff
    if (!customer.assigned_to) {
      const { assignCustomerRoundRobin } = require('../services/routingService');
      await assignCustomerRoundRobin(shop.id, customer.id);
    }

    // ========== AUTO-HIDE: Kiểm tra Cài đặt ==========
    let isHidden = 0;
    const hideConfig = integration.auto_hide_comments || 'none';
    
    if (hideConfig === 'all' || (hideConfig === 'phone' && PHONE_REGEX.test(commentText))) {
      console.log(`[AUTO-HIDE] 🚨 Trigger ẩn comment: Mode=${hideConfig}, Text="${commentText}"`);
      const hidden = await hideComment(commentId, shop.page_access_token);
      isHidden = hidden ? 1 : 0;
    }

    // Lưu comment vào Messages
    const msgResult = await db.run(
      'INSERT INTO Messages (shop_id, customer_id, sender, text, type, comment_id, post_id, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [shop.id, customer.id, 'customer', commentText, 'comment', commentId, postId, isHidden]
    );

    if (io) {
      io.to(String(shop.id)).emit('new_message', {
        id: msgResult.lastID, shop_id: shop.id, customer_id: customer.id,
        sender: 'customer', text: commentText, type: 'comment',
        comment_id: commentId, post_id: postId, is_hidden: isHidden,
        sender_name: customer.name, avatar_url: customer.avatar_url,
        timestamp: new Date().toISOString(),
      });
    }

    // ═══════════════════════════════════════════════════════
    // ★★★ AUTO-REPLY COMMENT RULES — Matching + Spintax ★★★
    // ═══════════════════════════════════════════════════════
    try {
      const commentRules = await db.all(
        'SELECT * FROM CommentRules WHERE shop_id = ? AND is_active = 1',
        [shop.id]
      );

      if (commentRules.length === 0) return;

      const lowerComment = commentText.toLowerCase();
      let matchedRule = null;

      for (const rule of commentRules) {
        // Check post_id: 'ALL' = áp dụng mọi bài, hoặc match cụ thể post_id
        if (rule.post_id && rule.post_id !== 'ALL' && rule.post_id !== postId) continue;

        // Check keywords
        if (rule.trigger_keywords) {
          let keywords = [];
          try { keywords = JSON.parse(rule.trigger_keywords); } catch { keywords = []; }

          if (keywords.length > 0) {
            const kwMatched = keywords.some((kw) => lowerComment.includes(kw.toLowerCase()));
            if (!kwMatched) continue;
          }
        }
        // Nếu trigger_keywords NULL = catch-all (bắt mọi comment)

        matchedRule = rule;
        break;
      }

      if (!matchedRule) return;

      console.log(`[AUTO-COMMENT] ✅ Match rule #${matchedRule.id} for comment "${commentText.substring(0, 50)}"`);

      // ★ Spintax Resolver: {A|B|C} → random pick
      const resolveSpintax = (text) => {
        if (!text) return text;
        return text.replace(/\{([^}]+)\}/g, (_, group) => {
          const options = group.split('|');
          return options[Math.floor(Math.random() * options.length)].trim();
        });
      };

      // ★ Rule-level auto-hide: ẩn comment chứa SĐT
      if (matchedRule.auto_hide && !isHidden && PHONE_REGEX.test(commentText)) {
        console.log(`[AUTO-COMMENT] 🚨 Rule auto-hide: ẩn comment chứa SĐT`);
        await hideComment(commentId, shop.page_access_token);
      }

      // ★ Reply Comment (Spintax resolved)
      if (matchedRule.reply_text) {
        const replyResolved = resolveSpintax(matchedRule.reply_text);
        console.log(`[AUTO-COMMENT] 💬 Reply: "${replyResolved.substring(0, 60)}..."`);
        await replyToComment(commentId, replyResolved, shop.page_access_token);

        // Lưu reply vào Messages
        const replyResult = await db.run(
          'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, type, comment_id, post_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [shop.id, customer.id, 'bot', 'bot', replyResolved, 'comment', commentId, postId]
        );

        if (io) {
          io.to(String(shop.id)).emit('new_message', {
            id: replyResult.lastID, shop_id: shop.id, customer_id: customer.id,
            sender: 'bot', sender_type: 'bot', text: replyResolved, type: 'comment',
            comment_id: commentId, post_id: postId,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // ★ Private Reply / Inbox (try-catch riêng vì dễ lỗi)
      if (matchedRule.inbox_text) {
        const inboxResolved = resolveSpintax(matchedRule.inbox_text);
        console.log(`[AUTO-COMMENT] 📩 Private Reply: "${inboxResolved.substring(0, 60)}..."`);
        try {
          await sendPrivateReply(commentId, inboxResolved, shop.page_access_token);

          // Lưu private reply vào Messages
          await db.run(
            'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, type, intent) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [shop.id, customer.id, 'bot', 'bot', inboxResolved, 'inbox', 'auto_comment_reply']
          );
        } catch (prErr) {
          console.error('[AUTO-COMMENT] ❌ Private Reply lỗi (user chặn tin nhắn?):', prErr.message);
        }
      }

    } catch (ruleError) {
      console.error('[AUTO-COMMENT] ❌ Rule matching error:', ruleError.message);
    }

  } catch (error) {
    console.error('[COMMENT PIPELINE] Lỗi:', error.message);
  }
}

/**
 * Ẩn / Hiện Comment thủ công
 */
async function toggleCommentVisibility(commentId, isHidden, pageAccessToken) {
  try {
    const url = `https://graph.facebook.com/v21.0/${commentId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_hidden: isHidden, access_token: pageAccessToken })
    });
    const data = await response.json();
    if (data.success) return true;
    console.error('[GRAPH API] Không thể toggle comment:', data.error?.message);
    return false;
  } catch (error) {
    console.error('[GRAPH API] Exception toggleComment:', error.message);
    return false;
  }
}

module.exports = { verifyWebhook, handleIncomingEvent, replyToComment, sendPrivateReply, hideComment, toggleCommentVisibility };
