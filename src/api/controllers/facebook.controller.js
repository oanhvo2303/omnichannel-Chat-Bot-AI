'use strict';

const config = require('../../config');
const { analyzeCustomerMessage, advancedAnalyzeMessage, agenticAnalyzeMessage, AI_ERROR_CODES } = require('../../services/ai/geminiService');
const { buildRAGContext, parseRAGResponse, shouldEscalate, buildEscalationReply, markNeedsHuman } = require('../../services/ai/ragService');
const crypto = require('crypto');
const { getDB } = require('../../infra/database/sqliteConnection');
const { getIO } = require('../../infra/socket/socketManager');
const { sendCapiEvent } = require('../../services/facebookCapiService');

// ─── Fix 1: Decrypt Gemini API key at-rest (mirrors aiSettings.routes.js) ────
const _ENC_KEY_HEX = process.env.ENCRYPTION_KEY || '';
function _decryptShopApiKey(stored) {
  if (!stored) return null;
  if (!stored.startsWith('enc:')) return stored; // legacy plaintext — pass through
  if (_ENC_KEY_HEX.length !== 64) {
    console.warn('[FB CTRL] ENCRYPTION_KEY chưa set — không thể decrypt shop API key!');
    return null;
  }
  try {
    const parts = stored.split(':'); // enc:iv:tag:ct
    const encKey = Buffer.from(_ENC_KEY_HEX, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(parts[1], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
    return decipher.update(Buffer.from(parts[3], 'hex')) + decipher.final('utf8');
  } catch (e) {
    console.error('[FB CTRL] Decrypt API key thất bại:', e.message);
    return null;
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// =============================================
// Regex phát hiện SĐT Việt Nam (để auto-hide comment)
// =============================================
const PHONE_REGEX = /(?:\+84|0)(?:\s?\.?-?){0,1}(?:3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d(?:\s?\.?-?){0,1}\d/;

// =============================================
// Vision Helper — Fetch ảnh từ Facebook URL → base64 cho Gemini
// =============================================
async function fetchImageAsBase64(imageUrl) {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) { console.warn(`[VISION] Không fetch được ảnh: HTTP ${res.status}`); return null; }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();
    if (!mimeType.startsWith('image/')) { console.warn(`[VISION] Không phải ảnh: ${mimeType}`); return null; }
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    console.log(`[VISION] ✅ Fetch ảnh OK: ${mimeType} | ${Math.round(arrayBuffer.byteLength / 1024)}KB`);
    return { base64, mimeType };
  } catch (err) {
    console.error('[VISION] ❌ Lỗi fetch ảnh:', err.message);
    return null;
  }
}

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
 * Tách AI response thành nhiều tin nhắn dựa trên separator ---NEXT--- do AI tự chèn
 */
const splitAIResponse = (text) => {
  if (!text) return [text];
  if (!text.includes('---NEXT---')) return [text];
  return text.split('---NEXT---').map(p => p.trim()).filter(Boolean);
};

/**
 * Gửi ảnh qua Facebook Attachment API
 */
const sendImageAPI = async (recipientId, imageUrl, pageAccessToken) => {
  if (!pageAccessToken || !imageUrl) return;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } } },
      }),
    });
    const data = await res.json();
    if (!res.ok) console.error('[FB SEND] ❌ Lỗi gửi ảnh:', data.error?.message);
    else console.log(`[FB SEND] 🖼️ Gửi ảnh → ${recipientId}`);
  } catch (err) {
    console.error('[FB SEND] ❌ Network error gửi ảnh:', err.message);
  }
};

/**
 * Gửi 1 phần tin nhắn (có thể chứa [IMG:url] và/hoặc [VIDEO:url] tags + text)
 */
const sendMessagePart = async (recipientId, part, pageAccessToken) => {
  // Tìm tất cả [IMG:url] và [VIDEO:url] trong phần này
  const imgRegex   = /\[IMG:(https?:\/\/[^\]]+)\]/g;
  const videoRegex = /\[VIDEO:(https?:\/\/[^\]]+)\]/g;

  const imgs   = [...part.matchAll(imgRegex)];
  const videos = [...part.matchAll(videoRegex)];
  const textOnly = part.replace(imgRegex, '').replace(videoRegex, '').trim();

  // Gửi ảnh trước
  for (const match of imgs) {
    await sendImageAPI(recipientId, match[1], pageAccessToken);
  }

  // Gửi video (Facebook Messenger attachment type=video)
  for (const match of videos) {
    const videoUrl = match[1];
    if (!pageAccessToken) continue;
    try {
      const body = {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'video',
            payload: { url: videoUrl, is_reusable: true },
          },
        },
      };
      const resp = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) console.error('[FB SEND] ❌ Lỗi gửi video:', data.error?.message);
      else console.log(`[FB SEND] 🎬 Video sent → ${recipientId}`);
    } catch (err) {
      console.error('[FB SEND] ❌ Network error gửi video:', err.message);
    }
  }

  // Gửi text sau (nếu có)
  if (textOnly) {
    await callSendAPI(recipientId, textOnly, pageAccessToken);
  }
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
 * Gửi typing indicator (dấu 3 chấm đang gõ) trên Messenger
 */
const sendTypingOn = async (recipientId, pageAccessToken) => {
  if (!pageAccessToken) return;
  try {
    await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, sender_action: 'typing_on' }),
    });
  } catch { /* silent */ }
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
    entry.messaging?.forEach(async (event) => {
      const senderId = event.sender?.id;
      if (!senderId) return;

      let messageText = event.message?.text;
      let imageData = null; // ★ VISION: imageData cho Gemini

      // ★ [QA FIX] Handle media messages (ảnh, sticker, video, audio)
      if (!messageText && event.message?.attachments?.length > 0) {
        const att = event.message.attachments[0];
        const typeMap = { image: 'Ảnh', video: 'Video', audio: 'Audio', file: 'File', fallback: 'Link' };
        const label = typeMap[att.type] || att.type;

        if (att.type === 'image' && att.payload?.url) {
          // ★ VISION: Fetch ảnh để Gemini đọc nội dung
          imageData = await fetchImageAsBase64(att.payload.url);
          messageText = imageData
            ? '[Khách gửi ảnh - AI đang phân tích nội dung ảnh...]'
            : `[Ảnh] ${att.payload.url}`;
        } else {
          messageText = `[${label}] ${att.payload?.url || ''}`;
        }
      }

      if (!messageText) return; // postback hoặc event lạ → bỏ qua an toàn

      console.log(`[FB INBOX] Page ${pageId} | From ${senderId}: "${messageText.substring(0, 120)}"${imageData ? ' 🖼️ +Vision' : ''}`);
      processInboxMessage(pageId, senderId, messageText, imageData);
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
async function processInboxMessage(pageId, senderId, messageText, imageData = null) {
  const pipelineStart = Date.now();
  let _paToken = null; // Fix 2: capture page_access_token cho outer catch fallback
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
      "SELECT id, shop_id, access_token, is_ai_active, ai_system_prompt, bot_rules_mode, ai_full_history FROM ShopIntegrations WHERE page_id = ? AND platform LIKE 'facebook%' AND status = 'connected'",
      [pageId]
    );
    if (!integration) {
      console.warn(`[INBOX PIPELINE] ⛔ Bỏ qua tin nhắn — Page ${pageId} không thuộc hệ thống (không có integration connected).`);
      return; 
    }
    const shop = { 
      id: integration.shop_id, 
      integration_id: integration.id,
      page_access_token: integration.access_token,
      is_ai_active: integration.is_ai_active,
      ai_system_prompt: integration.ai_system_prompt,
      bot_rules_mode: integration.bot_rules_mode || 'keyword',
      ai_full_history: integration.ai_full_history === 1
    };
    _paToken = shop.page_access_token; // Fix 2: capture để outer catch có thể gửi fallback
    console.log(`[AI TRACE] ✅ Tìm thấy Shop #${shop.id} | is_ai_active = ${shop.is_ai_active} (${shop.is_ai_active === 1 ? 'BẬT' : 'TẮT'}) | bot_rules_mode = ${shop.bot_rules_mode} | full_history = ${shop.ai_full_history ? '✅ BẬT' : '❌ TẮT'} | has_system_prompt = ${!!shop.ai_system_prompt}`);

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

    // ★ Step 1: Check Bot Rules Mode
    const rules = await db.all('SELECT * FROM BotRules WHERE shop_id = ? AND is_active = 1 AND (integration_id = ? OR integration_id IS NULL)', [shop.id, shop.integration_id]);
    let keywordReply = null;
    let keywordReplyType = 'text';
    let keywordMediaUrl = null;
    let matchedRule = null;

    // ═══════════════════════════════════════════════════
    // MODE: KEYWORD → Match từ khóa cứng (behavior cũ)
    // MODE: KNOWLEDGE → Skip keyword, inject rules vào AI
    // ═══════════════════════════════════════════════════
    const lowerText = messageText.toLowerCase();
    if (shop.bot_rules_mode === 'keyword') {
      // --- Mode Keyword: Giữ nguyên logic match từ khóa ---
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
    } else {
      // --- Mode Knowledge: 100% AI xử lý. Rules inject vào prompt, AI tự quyết định ---
      console.log(`[BOT RULES] 🧠 Mode=KNOWLEDGE → 100% AI. ${rules.length} rules inject vào prompt.`);
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

        // ★ Hiển thị "đang gõ..." trên Messenger để khách biết đang được phản hồi
        await sendTypingOn(senderId, shop.page_access_token);

        // ★ Lấy lịch sử hội thoại — P1c fix: loại trừ tin hiện tại (id < msgResult.lastID) để tránh lặp context
        const HISTORY_LIMIT = shop.ai_full_history ? 300 : 10;
        const historyRows = await db.all(
          `SELECT sender, text FROM Messages WHERE customer_id = ? AND id < ? ORDER BY timestamp DESC LIMIT ?`,
          [customer.id, msgResult.lastID, HISTORY_LIMIT]
        );
        historyRows.reverse();
        console.log(`[AI TRACE] 📜 History mode: ${shop.ai_full_history ? 'FULL (' + historyRows.length + ' msgs)' : 'COMPACT (' + historyRows.length + '/10 msgs)'}`);

        // Fix Issue 3: Relevance-ranked catalog — chỉ inject top 15 SP liên quan thay vì toàn bộ
        // Giảm token cost O(n) → O(15) khi shop có nhiều sản phẩm, tăng độ chính xác context
        const CATALOG_LIMIT = 15;
        const products = await db.all(
          'SELECT name, price, stock_quantity, sku, volume_pricing FROM Products WHERE shop_id = ? AND stock_quantity > 0',
          [shop.id]
        );

        // Rank products bằng keyword relevance với tin nhắn hiện tại
        const msgNorm = messageText.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd');
        const msgWords = msgNorm.split(/\s+/).filter(w => w.length >= 2);

        const scoredProducts = products.map(p => {
          const pNorm = p.name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd');
          const skuNorm = (p.sku || '').toLowerCase();
          // Score: keyword hits + SKU exact match bonus
          const kwScore = msgWords.filter(w => pNorm.includes(w)).length;
          const skuBonus = msgWords.some(w => skuNorm.includes(w)) ? 3 : 0;
          return { ...p, _score: kwScore + skuBonus };
        });

        // Lấy top 15 theo relevance; nếu không có match → top 15 theo price (showcase mặc định)
        const hasAnyMatch = scoredProducts.some(p => p._score > 0);
        const rankedProducts = hasAnyMatch
          ? scoredProducts.sort((a, b) => b._score - a._score).slice(0, CATALOG_LIMIT)
          : products.slice(0, CATALOG_LIMIT); // giữ nguyên thứ tự DB (thường theo id)

        const productCatalog = rankedProducts.length > 0
          ? rankedProducts.map(p => {
              let line = `- ${p.name} (${p.sku || 'N/A'}): ${p.price?.toLocaleString()}đ — Còn ${p.stock_quantity} sp`;
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

        if (products.length > CATALOG_LIMIT) {
          console.log(`[AI TRACE] 📦 Catalog: ${rankedProducts.length}/${products.length} SP (top relevant) | hasMatch=${hasAnyMatch}`);
        }

        // ★ Inject shipping settings vào catalog để AI tính phí ship chính xác
        const shipSettings = await db.get('SELECT default_shipping_fee, free_shipping_threshold, free_shipping_min_quantity FROM Shops WHERE id = ?', [shop.id]);
        const defaultShip = shipSettings?.default_shipping_fee || 30000;
        const freeThreshold = shipSettings?.free_shipping_threshold || 0;
        const freeMinQty = shipSettings?.free_shipping_min_quantity || 0;

        let freeshipRules = [];
        if (freeThreshold > 0) freeshipRules.push(`đơn từ ${freeThreshold.toLocaleString()}đ trở lên`);
        if (freeMinQty > 0) freeshipRules.push(`mua từ ${freeMinQty} sản phẩm trở lên`);

        const shippingInfo = `\n\n📦 CÀI ĐẶT PHÍ SHIP:\n- Phí ship mặc định: ${defaultShip.toLocaleString()}đ\n${freeshipRules.length > 0 ? `- 🎉 MIỄN PHÍ SHIP khi: ${freeshipRules.join(' HOẶC ')}\n- Thỏa 1 trong các điều kiện trên → Ship = 🎉 Miễn phí` : '- Không có điều kiện miễn phí ship'}\nBẮT BUỘC sử dụng thông tin này khi lên bảng tính tiền cho khách.`;

        // ═══ AI QUOTA ENFORCEMENT ═══
        const shopLicense = await db.get('SELECT license_status, ai_quota_limit, ai_messages_used, gemini_api_key FROM Shops WHERE id = ?', [shop.id]);
        if (shopLicense && shopLicense.license_status !== 'ACTIVE' && shopLicense.license_status !== 'TRIAL') {
          console.log(`[AI] ⛔ Shop #${shop.id} license=${shopLicense.license_status} — AI disabled`);
          // Fix 1: gửi ngay cho khách, không chờ nhánh quota-OK bên dưới
          const errMsg = 'Xin lỗi, hệ thống chatbot tạm thời không khả dụng. Vui lòng liên hệ chủ shop.';
          await callSendAPI(senderId, errMsg, shop.page_access_token);
          console.log(`[INBOX PIPELINE] ⏱️ Pipeline kết thúc sau ${Date.now() - pipelineStart}ms (LICENSE BLOCKED)`);
          return;
        } else if (shopLicense && shopLicense.ai_quota_limit > 0 && shopLicense.ai_messages_used >= shopLicense.ai_quota_limit) {
          // Quota limit > 0 = có giới hạn. Nếu <= 0 = unlimited, skip check.
          console.log(`[AI] ⛔ Shop #${shop.id} quota exceeded: ${shopLicense.ai_messages_used}/${shopLicense.ai_quota_limit}`);
          // Fix 1: gửi ngay + chuyển nhân viên
          const quotaMsg = 'Xin lỗi, hệ thống chatbot tạm thời bận. Nhân viên sẽ hỗ trợ bạn sớm nhất! 🙏';
          await callSendAPI(senderId, quotaMsg, shop.page_access_token);
          console.log(`[INBOX PIPELINE] ⏱️ Pipeline kết thúc sau ${Date.now() - pipelineStart}ms (QUOTA EXCEEDED)`);
          return;
        } else {
          // ═══ KNOWLEDGE BASE: Inject Bot Rules vào AI prompt (nếu mode=knowledge) ═══
          let knowledgeBase = '';
          if (shop.bot_rules_mode === 'knowledge' && rules.length > 0) {
            const knowledgeEntries = rules.map(rule => {
              // Parse steps nếu có
              let contentParts = [];
              try {
                const steps = rule.steps ? JSON.parse(rule.steps) : null;
                if (steps && Array.isArray(steps) && steps.length > 0) {
                  contentParts = steps.filter(s => s.text && s.text.trim()).map(s => s.text.trim());
                }
              } catch { /* parse error */ }

              // Fallback: dùng response nếu không có steps
              if (contentParts.length === 0 && rule.response) {
                contentParts = [rule.response];
              }

              const hasScript = (rule.steps && JSON.parse(rule.steps || '[]').length > 0) ? ` [SCRIPT_ID:${rule.id}]` : '';
              return `📌${hasScript} Khi khách hỏi về "${rule.keywords}":\n${contentParts.map(c => `   → ${c}`).join('\n')}`;
            });

            knowledgeBase = `
═══════════════════════════════
KHO KIẾN THỨC CỦA SHOP (Tham khảo để trả lời):
Dưới đây là các câu trả lời mẫu. Mục nào có [SCRIPT_ID:X] nghĩa là CÓ kịch bản multi-step sẵn → KHI khách hỏi về chủ đề đó, BẮT BUỘC gọi execute_bot_script(rule_id=X) để hệ thống gửi kịch bản. KHÔNG tự viết lại nội dung.
═══════════════════════════════
${knowledgeEntries.join('\n\n')}
═══════════════════════════════`;

            console.log(`[AI TRACE] 🧠 Knowledge Base injected: ${rules.length} rules → ${knowledgeBase.length} chars`);
          }

          // ★ RAG: Retrieve relevant FAQs + build context
          const ragCtx = await buildRAGContext(shop.id, messageText, shop.integration_id || null);
          const ragFaqBlock = ragCtx.faqContext;    // FAQ Q&A block
          const ragInstructions = ragCtx.ragInstructions; // Confidence + no-hallucination rules
          if (ragCtx.relevantFaqs.length > 0) {
            console.log(`[RAG] 📚 Injecting ${ragCtx.relevantFaqs.length} FAQs (scores: ${ragCtx.relevantFaqs.map(f => f.score?.toFixed(2)).join(', ')})`);
          }

          // Merge knowledge base + shipping info + FAQ vào product catalog
          const catalogWithShipping = `${productCatalog}${shippingInfo}`;
          const enrichedCatalog = [
            catalogWithShipping,
            knowledgeBase || '',
            ragFaqBlock,
          ].filter(Boolean).join('\n\n');

          // Merge RAG instructions vào system prompt
          const enrichedSystemPrompt = shop.ai_system_prompt
            ? `${shop.ai_system_prompt}\n\n${ragInstructions}`
            : ragInstructions;

          console.log(`[AI TRACE] 🤖 Gọi Gemini AGENTIC cho Khách #${customer.id} (${customer.name}) | History: ${historyRows.length} msgs | Products: ${products.length} | FAQs: ${ragCtx.relevantFaqs.length} | Knowledge: ${shop.bot_rules_mode === 'knowledge' ? rules.length + ' rules' : 'OFF'} | Key: ${shopLicense?.gemini_api_key ? 'SHOP' : 'GLOBAL'} | Quota: ${shopLicense?.ai_messages_used || 0}/${shopLicense?.ai_quota_limit || 0}`);
          // Fix 1: decrypt key before passing to Gemini (enc:iv:tag:ct → plaintext)
          const decryptedShopKey = _decryptShopApiKey(shopLicense?.gemini_api_key || null);
          const rawAnalysis = await agenticAnalyzeMessage(messageText, enrichedSystemPrompt, historyRows, { shopId: shop.id, customerId: customer.id, customerName: customer.name, shopApiKey: decryptedShopKey }, enrichedCatalog, imageData);

          // ★ RAG Confidence Guard — chỉ escalate khi Gemini thực sự không có reply
          const ragResult = parseRAGResponse(rawAnalysis);
          const escalation = shouldEscalate(ragResult);

          // Fix 3: Escalation guard thông minh hơn
          // Chỉ hard-escalate khi:
          //   (A) Gemini tự khai source='escalate' — không biết trả lời
          //   (B) confidence cực thấp (≤0.35) VÀ không có reply VÀ không có tool call
          // Không escalate khi: Gemini có reply dài > 5 chars, dù confidence thấp
          const hasValidReply      = rawAnalysis.reply && rawAnalysis.reply.trim().length > 5;
          const hasToolCalls       = rawAnalysis.toolCalls?.length > 0;
          const isExplicitEscalate = ragResult.source === 'escalate';
          const isVeryLowConf      = typeof ragResult.confidence === 'number' && ragResult.confidence <= 0.35;
          const doHardEscalate     = !hasValidReply && !hasToolCalls && (isExplicitEscalate || isVeryLowConf);

          if (doHardEscalate) {
            console.log(`[RAG] ⚠️ Hard escalate #${customer.id}: source=${ragResult.source}, conf=${ragResult.confidence}`);
            replyText = buildEscalationReply(customer.name);
            replyIntent = 'ESCALATE';
            markNeedsHuman(customer.id, shop.id, escalation.reason);
          } else {
            replyText = ragResult.reply;
            replyIntent = ragResult.intent;
            if (escalation.shouldEscalate && !doHardEscalate) {
              console.log(`[RAG] ℹ️ Soft conf (${ragResult.confidence}) nhưng Gemini có reply → giữ nguyên`);
            }
          }

          const analysis = rawAnalysis; // Giữ toolCalls để xử lý bên dưới

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

              // ★★★ GỬI MẪU HÓA ĐƠN CHUYÊN NGHIỆP CHO KHÁCH ★★★
              if (call.result.billTemplate) {
                try {
                  // 1. Gửi qua Messenger
                  await callSendAPI(senderId, call.result.billTemplate, shop.page_access_token);
                  console.log(`[AI TRACE] 🧾 Đã gửi mẫu hóa đơn Đơn #${call.result.orderId} cho khách qua Messenger`);

                  // 2. Lưu vào DB để hiện trong chat dashboard
                  const billResult = await db.run(
                    'INSERT INTO Messages (shop_id, customer_id, sender, sender_type, text, intent, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [shop.id, customer.id, 'bot', 'system', call.result.billTemplate, 'bill', 'inbox']
                  );

                  // 3. Emit qua Socket cho Dashboard
                  if (io) {
                    io.to(String(shop.id)).emit('new_message', {
                      id: billResult.lastID,
                      shop_id: shop.id,
                      customer_id: customer.id,
                      sender: 'bot',
                      sender_type: 'system',
                      text: call.result.billTemplate,
                      intent: 'bill',
                      type: 'inbox',
                      timestamp: new Date().toISOString(),
                    });
                  }
                } catch (billErr) {
                  console.error(`[AI TRACE] ⚠️ Lỗi gửi hóa đơn:`, billErr.message);
                }
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

            // ★★★ EXECUTE BOT SCRIPT: AI chọn kịch bản → hệ thống gửi multi-step ★★★
            if (call.name === 'execute_bot_script' && call.result?.success) {
              const ruleId = call.args?.rule_id || call.result?.rule_id;
              console.log(`[AI TRACE] 📜 AI chọn kịch bản ID #${ruleId} → Tìm và thực thi multi-step...`);

              // Tìm rule trực tiếp bằng ID (AI đã biết ID từ Kho Kiến Thức)
              let matchedScriptRule = null;
              if (ruleId) {
                matchedScriptRule = await db.get('SELECT * FROM BotRules WHERE id = ? AND shop_id = ? AND is_active = 1', [ruleId, shop.id]);
              }

              if (matchedScriptRule && matchedScriptRule.steps) {
                let parsedSteps = null;
                try { parsedSteps = JSON.parse(matchedScriptRule.steps); } catch { parsedSteps = null; }

                if (parsedSteps && Array.isArray(parsedSteps) && parsedSteps.length > 0) {
                  const { executeBotSteps } = require('../../services/bot/botStepExecutor');
                  executeBotSteps({
                    steps: parsedSteps,
                    senderId,
                    pageAccessToken: shop.page_access_token,
                    shopId: shop.id,
                    customerId: customer.id,
                    io,
                    ruleKeyword: matchedScriptRule.keywords,
                  }).catch((err) => {
                    console.error('[BOT STEP] ❌ Script executor crash:', err.message);
                  });

                  console.log(`[AI TRACE] ✅ Kịch bản "${matchedScriptRule.keywords}" → ${parsedSteps.length} bước (fire-and-forget)`);
                  console.log(`[INBOX PIPELINE] ⏱️ Pipeline kết thúc sau ${Date.now() - pipelineStart}ms (AI → bot script)`);
                  return; // DỪNG — botStepExecutor tự gửi + lưu DB
                }
              }

              console.log(`[AI TRACE] ⚠️ Không tìm thấy kịch bản ID #${ruleId} → AI tự trả lời`);
            }
          }
        }

        // Fix 2: Gửi fallback tự nhiên — KHÔNG để khách thấy "đang gõ" rồi im lặng
        if (replyIntent === 'LỖI' || !replyText) {
          console.error('═'.repeat(60));
          console.error(`[AI TRACE] ❌ AI LỖI → GỬI FALLBACK CHO KHÁCH`);
          console.error(`[AI TRACE] ErrorCode: ${analysis.errorCode || 'UNKNOWN'}`);
          console.error(`[AI TRACE] ErrorMessage: ${analysis.errorMessage || 'N/A'}`);
          console.error(`[AI TRACE] Shop #${shop.id} | Khách #${customer.id} (${customer.name})`);
          console.error('═'.repeat(60));

          // Chọn fallback theo loại lỗi
          const errCode = analysis.errorCode || '';
          const errMsg  = (analysis.errorMessage || '').toLowerCase();
          const isTimeout = errCode === 'GEMINI_TIMEOUT' || errMsg.includes('timeout');
          const isQuota   = errCode === 'QUOTA_EXCEEDED'  || errMsg.includes('quota') || errMsg.includes('429');
          const fallbackMsg = isTimeout
            ? 'Dạ hệ thống đang xử lý hơi chậm, anh/chị nhắn lại sau vài giây nhé! Xin lỗi vì sự bất tiện này 🙏'
            : isQuota
            ? 'Xin lỗi, chatbot đang bận — nhân viên sẽ hỗ trợ bạn ngay! Để lại SĐT để được gọi lại nhanh nhất nhé 📞'
            : 'Dạ em chưa hiểu rõ câu hỏi của bạn, anh/chị có thể nhắn lại hoặc để lại SĐT để nhân viên liên hệ nhé! 😊';

          try {
            await callSendAPI(senderId, fallbackMsg, shop.page_access_token);
            console.log(`[AI TRACE] ✅ Đã gửi fallback: "${fallbackMsg.substring(0, 60)}..."`);
          } catch (sendErr) {
            console.error('[AI TRACE] ❌ Không gửi được fallback:', sendErr.message);
          }

          // Emit lỗi lên Dashboard để owner biết mà xử lý
          if (io) {
            io.to(String(shop.id)).emit('ai_error', {
              customer_id: customer.id,
              customer_name: customer.name || `Khách #${senderId.slice(-4)}`,
              error_code: errCode || 'UNKNOWN',
              error_message: analysis.errorMessage || 'AI gặp lỗi không xác định.',
              original_message: messageText.substring(0, 200),
              timestamp: new Date().toISOString(),
            });
            console.log(`[AI TRACE] 📡 Đã emit 'ai_error' lên Dashboard (Room: Shop #${shop.id})`);
          }

          console.log(`[INBOX PIPELINE] ⏱️ Pipeline kết thúc sau ${Date.now() - pipelineStart}ms (AI ERROR → fallback sent)`);
          return;
        }

        console.log(`[AI TRACE] ✅ AI trả lời thành công: Intent=${replyIntent} | Reply="${replyText?.substring(0, 60)}..."`);
        
        // ★★★ TÁCH AI RESPONSE THÀNH NHIỀU TIN NHẮN GỬI TUẦN TỰ ★★★
        const messageParts = splitAIResponse(replyText);
        
        for (let i = 0; i < messageParts.length; i++) {
          const part = messageParts[i];
          if (i > 0) {
            // Typing indicator + delay giữa các tin
            await sendTypingOn(senderId, shop.page_access_token);
            const typingDelay = Math.min(Math.max(part.length * 30, 800), 3000);
            await new Promise(r => setTimeout(r, typingDelay));
          }
          // Bug 3 fix: dùng sendMessagePart thay callSendAPI → hỗ trợ [IMG:url] → attachment ảnh FB
          await sendMessagePart(senderId, part, shop.page_access_token);
        }
        console.log(`[AI TRACE] 📨 Đã gửi ${messageParts.length} tin nhắn riêng biệt`);

        } // end else (AI quota OK)
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

    // Bug 4 fix: cập nhật last_bot_message_at để followupScheduler biết AI đã reply
    await db.run(
      `UPDATE Customers SET last_bot_message_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`,
      [customer.id, shop.id]
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

    // Fix 2: nếu typing đã bật mà pipeline crash → gửi fallback cho khách
    // _paToken được capture ngay sau khi resolve shop (xem bên dưới)
    if (senderId && _paToken) {
      callSendAPI(senderId, 'Dạ hệ thống đang gặp sự cố, nhân viên sẽ hỗ trợ bạn ngay! Xin lỗi vì sự bất tiện 🙏', _paToken)
        .catch(() => {});
    }

    // Emit lỗi pipeline lên Dashboard (không có shopId → log thôi)
    try {
      getIO(); // just ensure no uncaught reference
      console.error('[PIPELINE CRASH EMIT] Không thể emit ai_error do chưa có shopId. Xem server log để debug.');
    } catch { /* chống crash thêm */ }
  }
}

/**
 * Pipeline xử lý Comment (+ auto-hide SĐT)
 */
async function processComment(pageId, senderId, senderName, commentText, commentId, postId) {
  try {
    const db = getDB();
    const io = getIO();

    // FIX: Dùng LIKE 'facebook%' để match cả 'facebook' lẫn 'facebook_<pageId>' (multi-page)
    const integration = await db.get(
      "SELECT shop_id, access_token, auto_hide_comments FROM ShopIntegrations WHERE page_id = ? AND platform LIKE 'facebook%' AND status = 'connected'",
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
