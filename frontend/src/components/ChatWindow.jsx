"use client";

import { useRef, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Send, StickyNote, Zap, X, MessageCircle, Reply, Mail, Bot, UserCog, ToggleLeft, ToggleRight, ArrowDown, Clock, EyeOff, Eye, ExternalLink, Image as ImageIcon, AlertTriangle, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const PostContextViewer = ({ postId, pageId }) => {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId || !pageId) return;
    setLoading(true);
    const fetchPost = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/api/facebook/post/${postId}?page_id=${pageId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.error) setPost(data);
      } catch (err) { }
      finally { setLoading(false); }
    };
    fetchPost();
  }, [postId, pageId]);

  if (!postId || !pageId) return null;
  if (loading) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-50 border-b border-zinc-100 animate-pulse">
        <div className="w-10 h-10 bg-zinc-200 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2"><div className="h-3 bg-zinc-200 rounded w-1/4" /><div className="h-3 bg-zinc-200 rounded w-3/4" /></div>
      </div>
    );
  }
  if (!post) return null;

  return (
    <div className="flex items-start gap-3 px-5 py-3 bg-blue-50/50 border-b border-blue-100 group">
      {post.full_picture ? (
        <img src={post.full_picture} alt="Post" className="w-10 h-10 rounded-lg object-cover shadow-sm ring-1 ring-black/5" />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shadow-sm text-blue-500"><ImageIcon className="w-5 h-5" /></div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 mb-0.5">
          <ExternalLink className="w-3.5 h-3.5" /> Khách hàng đang hỏi về bài viết này:
        </div>
        <a href={post.permalink_url} target="_blank" rel="noreferrer" className="text-[11px] text-zinc-600 line-clamp-2 hover:underline">
          {post.message || "Không có nội dung văn bản."}
        </a>
      </div>
    </div>
  );
};

export default function ChatWindow({
  messages, customerName, onSendMessage, quickReplies = [], onManageQuickReplies,
  onReplyComment, onPrivateReply, onToggleCommentVisibility, selectedCustomer, onSendInternalNote, onToggleAI,
  staffList, onTransfer
}) {
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [inputValue, setInputValue] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [qrFilter, setQrFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [replyingTo, setReplyingTo] = useState(null);
  const [inputMode, setInputMode] = useState("send");
  const [showScrollBadge, setShowScrollBadge] = useState(false);
  const isAtBottomRef = useRef(true);
  const qrListRef = useRef(null);
  const [aiError, setAiError] = useState(null);

  // ★ Lắng nghe Socket.IO 'ai_error' event để hiển thị banner
  useEffect(() => {
    const socket = typeof window !== 'undefined' ? window.__omnichannel_socket : null;
    if (!socket) return;

    const handleAiError = (data) => {
      console.error('[ChatWindow] 🚨 AI Error received:', data);
      setAiError(data);
      // Tự xóa warning sau 30 giây
      setTimeout(() => setAiError(null), 30000);
    };

    socket.on('ai_error', handleAiError);
    return () => socket.off('ai_error', handleAiError);
  }, []);

  // ★ Lắng nghe Socket.IO 'ai_order_created' — hiển thị system message khi AI tạo đơn
  const [aiOrderMessages, setAiOrderMessages] = useState([]);
  useEffect(() => {
    const socket = typeof window !== 'undefined' ? window.__omnichannel_socket : null;
    if (!socket) return;

    const handleAiOrder = (data) => {
      console.log('[ChatWindow] 🎉 AI Order Created:', data);
      if (data.customer_id === selectedCustomer?.id) {
        setAiOrderMessages(prev => [...prev, {
          id: `ai-order-${data.order_id}`,
          type: 'ai_order',
          order_id: data.order_id,
          product_name: data.product_name,
          total_amount: data.total_amount,
          quantity: data.quantity,
          timestamp: data.timestamp,
        }]);
      }
    };

    socket.on('ai_order_created', handleAiOrder);
    return () => socket.off('ai_order_created', handleAiOrder);
  }, [selectedCustomer?.id]);

  useEffect(() => { 
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
    } else {
      setShowScrollBadge(true);
    }
  }, [messages]);

  const handleScroll = (e) => {
    const target = e.target;
    // ensure it's the element with scroll info
    if (target.scrollHeight) {
      const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
      isAtBottomRef.current = isAtBottom;
      if (isAtBottom) setShowScrollBadge(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBadge(false);
    isAtBottomRef.current = true;
  };

  const filteredQR = quickReplies.filter((qr) =>
    qr.shortcut.toLowerCase().includes(qrFilter.toLowerCase()) ||
    qr.content.toLowerCase().includes(qrFilter.toLowerCase())
  );

  useEffect(() => {
    if (showQR && qrListRef.current) {
      const activeEl = qrListRef.current.children[selectedIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, showQR]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    if (val.startsWith("/")) { 
       setShowQR(true); 
       setQrFilter(val.slice(1)); 
       setSelectedIndex(0);
    }
    else { setShowQR(false); setQrFilter(""); }
  };

  const selectQuickReply = (qr) => { 
    const finalContent = qr.content.replace(/{name}/g, customerName || "Anh/Chị");
    setInputValue(finalContent); 
    setShowQR(false); 
    setQrFilter(""); 
    inputRef.current?.focus(); 
  };

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;
    if (replyingTo) {
      if (replyingTo.mode === "reply") onReplyComment?.(replyingTo.commentId, text);
      else onPrivateReply?.(replyingTo.commentId, text);
      setReplyingTo(null);
    } else if (inputMode === "note") {
      onSendInternalNote?.(text);
    } else {
      onSendMessage(text);
    }
    setInputValue("");
    setShowQR(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (showQR && filteredQR.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredQR.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredQR.length) % filteredQR.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectQuickReply(filteredQR[selectedIndex]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") { setShowQR(false); setReplyingTo(null); }
  };

  // ★★★ Facebook-style time formatting ★★★
  // SQLite CURRENT_TIMESTAMP lưu UTC nhưng không có 'Z' suffix
  // → Phải append 'Z' để JS biết là UTC và tự convert sang giờ local (VN = UTC+7)
  const parseTimestamp = (ts) => {
    if (!ts) return null;
    // Nếu đã có 'Z' hoặc '+' (ISO format) thì giữ nguyên
    if (ts.includes('Z') || ts.includes('+')) return new Date(ts);
    // SQLite format: "2026-03-29 08:45:28" → thêm 'Z' để đánh dấu UTC
    return new Date(ts.replace(' ', 'T') + 'Z');
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const date = parseTimestamp(ts);
    if (!date || isNaN(date)) return "";
    return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateDivider = (ts) => {
    if (!ts) return "";
    const date = parseTimestamp(ts);
    if (!date || isNaN(date)) return "";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (msgDate.getTime() === today.getTime()) return "Hôm nay";
    if (msgDate.getTime() === yesterday.getTime()) return "Hôm qua";
    
    // Trong 7 ngày gần → hiện thứ
    const diffDays = Math.floor((today - msgDate) / 86400000);
    if (diffDays < 7) {
      const days = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
      return days[date.getDay()];
    }

    // Quá 7 ngày → hiện ngày/tháng/năm
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  // Kiểm tra 2 tin nhắn có khác ngày không (dùng local time)
  const isDifferentDay = (ts1, ts2) => {
    if (!ts1 || !ts2) return true;
    const d1 = parseTimestamp(ts1), d2 = parseTimestamp(ts2);
    if (!d1 || !d2) return true;
    return d1.getFullYear() !== d2.getFullYear() || d1.getMonth() !== d2.getMonth() || d1.getDate() !== d2.getDate();
  };

  // Kiểm tra 2 tin nhắn cách nhau > 5 phút (để gộp timestamp)
  const shouldShowTime = (currentTs, prevTs) => {
    if (!prevTs || !currentTs) return true;
    const c = parseTimestamp(currentTs), p = parseTimestamp(prevTs);
    if (!c || !p) return true;
    return Math.abs(c - p) > 5 * 60 * 1000;
  };

  const intentBadge = (intent) => {
    const map = {
      HỎI_GIÁ: "bg-sky-50 text-sky-700 border-sky-200", ĐẶT_HÀNG: "bg-emerald-50 text-emerald-700 border-emerald-200",
      KHIẾU_NẠI: "bg-red-50 text-red-700 border-red-200", HỖ_TRỢ: "bg-amber-50 text-amber-700 border-amber-200",
      CHÀO_HỎI: "bg-violet-50 text-violet-700 border-violet-200", keyword_rule: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
    return map[intent] || "bg-zinc-50 text-zinc-600 border-zinc-200";
  };

  if (!customerName) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-zinc-50 to-white">
        <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shadow-sm">
          <MessageCircle className="w-10 h-10 text-blue-400" />
        </div>
        <p className="text-lg font-semibold text-zinc-700">Chọn một cuộc trò chuyện</p>
        <p className="text-sm text-zinc-400 mt-1">để bắt đầu xem tin nhắn</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm ring-2 ring-white shadow-md">
            {selectedCustomer?.avatar_url ? (
               <img src={selectedCustomer.avatar_url} alt={customerName} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
               customerName?.charAt(0)?.toUpperCase() || "?"
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-zinc-900">{customerName}</h3>
            <p className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Đang hoạt động
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Staff Assignment Select */}
          {staffList && staffList.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg group hover:bg-zinc-100 transition-colors">
              <UserCog className="w-3.5 h-3.5 text-zinc-500" />
              <select
                value={selectedCustomer?.assigned_to || ""}
                onChange={(e) => {
                  if (e.target.value) onTransfer?.(selectedCustomer.id, parseInt(e.target.value));
                }}
                className="text-[11px] font-medium bg-transparent outline-none text-zinc-700 cursor-pointer w-[110px]"
              >
                <option value="">Chưa phân công</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} {staff.is_online ? "🟢" : "⚪"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* AI Toggle */}
          <button onClick={() => selectedCustomer && onToggleAI?.(selectedCustomer.id, selectedCustomer.is_ai_paused === 0 ? 1 : 0)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all border", 
              selectedCustomer?.is_ai_paused === 1 
                ? "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100" 
                : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 shadow-sm shadow-indigo-500/10"
            )}>
            <Bot className={cn("w-3.5 h-3.5", selectedCustomer?.is_ai_paused === 1 ? "opacity-50" : "text-indigo-600")} />
            {selectedCustomer?.is_ai_paused === 1 ? "AI đang Tắt" : "AI đang Giao tiếp"}
          </button>

          <button onClick={onManageQuickReplies}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg transition-all">
            <Zap className="w-3.5 h-3.5" /> Tin nhắn mẫu
          </button>
        </div>
      </div>

      {/* Post Context for Comments */}
      {selectedCustomer?.lastMessageType === 'comment' && (
        <PostContextViewer 
          postId={messages.findLast(m => m.type === 'comment')?.post_id} 
          pageId={selectedCustomer.page_id} 
        />
      )}

      {/* ★★★ AI Error Warning Banner ★★★ */}
      <AnimatePresence>
        {aiError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="px-4 py-3 bg-gradient-to-r from-red-50 to-orange-50 border-b-2 border-red-300"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-red-800">⚠️ AI Bot gặp sự cố</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-200 text-red-700 font-bold">{aiError.error_code}</span>
                </div>
                <p className="text-[11px] text-red-700 mt-0.5 leading-relaxed">
                  {aiError.error_message || 'AI không thể phản hồi khách hàng.'}
                </p>
                {aiError.customer_name && (
                  <p className="text-[10px] text-orange-600 mt-1 font-medium">Khách bị ảnh hưởng: {aiError.customer_name}</p>
                )}
              </div>
              <button onClick={() => setAiError(null)} className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="relative flex-1 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 bg-gradient-to-b from-zinc-50/50 to-white" onScrollCapture={handleScroll}>
          <div className="px-5 py-4 space-y-3 relative">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full py-20 text-zinc-400 text-sm">Chưa có tin nhắn.</div>
          )}
          {messages.map((msg, index) => {
            const isComment = msg.type === "comment";
            const isHidden = msg.is_hidden === 1;
            const isInternal = msg.is_internal === 1;
            const isSystem = msg.sender_type === "system";
            const isShop = msg.sender === "bot" || msg.sender === "shop";
            const isAiBot = msg.sender_type === "bot";
            const isStaff = msg.sender_type === "staff";

            // ★ System messages (AI auto-tag) — render as centered notification
            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400 bg-zinc-50 border border-zinc-100 px-3 py-1 rounded-full font-medium">
                    {msg.text}
                  </span>
                </div>
              );
            }

            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showDateDivider = isDifferentDay(msg.timestamp, prevMsg?.timestamp);
            const showTime = shouldShowTime(msg.timestamp, prevMsg?.timestamp);

            return (
              <div key={msg.id}>
                {/* ★ Date Divider — giống Facebook Messenger ★ */}
                {showDateDivider && msg.timestamp && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-zinc-200" />
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-2">
                      {formatDateDivider(msg.timestamp)}
                    </span>
                    <div className="flex-1 h-px bg-zinc-200" />
                  </div>
                )}

                {/* ★ Time Group Divider — khi cách > 5 phút ★ */}
                {!showDateDivider && showTime && msg.timestamp && (
                  <div className="flex justify-center my-3">
                    <span className="text-[10px] text-zinc-400 font-medium">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                )}

                {/* ★ System Message: AI tự tạo đơn hàng ★ */}
                {msg.intent === 'ĐẶT_HÀNG' && msg.sender_type === 'bot' && msg.text?.includes('#') && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center my-2"
                  >
                    <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-full shadow-sm">
                      <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[11px] font-bold text-emerald-700">🤖 AI đã tự động tạo đơn hàng</span>
                    </div>
                  </motion.div>
                )}

                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.2, type: "spring", stiffness: 300, damping: 24 }}
                  className={cn("flex", isShop ? "justify-start" : "justify-end", msg.status === 'sending' ? 'opacity-50 blur-[0.5px]' : '', msg.status === 'error' ? 'text-red-500' : '')}
                >
                  <div className="max-w-[75%] group">
                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mb-1">
                      {isInternal && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">📌 Nội bộ</span>
                      )}
                      {isComment && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">💬 Comment</span>
                      )}
                      {isComment && !isHidden && msg.sender === "customer" && (
                        <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Công khai</span>
                      )}
                      {isHidden && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 animate-pulse">🔒 ĐÃ ẨN</span>
                      )}
                      {isShop && msg.intent && isAiBot && (
                        <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", intentBadge(msg.intent))}>{msg.intent}</span>
                      )}
                    </div>

                    {/* Bubble */}
                    <div className={cn("px-4 py-3 text-[13px] leading-relaxed shadow-sm transition-all",
                      isInternal ? "bg-amber-50 border-2 border-amber-200 text-amber-900 rounded-2xl rounded-bl-md italic"
                      : isComment ? (isShop ? "bg-orange-50 border border-orange-200 text-zinc-800 rounded-2xl rounded-bl-md" : "bg-orange-100 border border-orange-300 text-zinc-800 rounded-2xl rounded-br-md")
                      : isShop ? (isAiBot ? "bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl rounded-bl-md" : "bg-zinc-100 border border-zinc-200 text-zinc-800 rounded-2xl rounded-bl-md") 
                      : msg.status === 'error' ? "bg-red-500 text-white rounded-2xl rounded-br-md" 
                      : "bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl rounded-br-md shadow-blue-500/20 shadow-md",
                      "relative"
                    )}>
                      {msg.text}
                      {msg.status === 'sending' && (
                        <span className="absolute -right-2 -bottom-2 bg-white text-zinc-400 p-0.5 rounded-full shadow-sm border border-zinc-100 animate-pulse">
                          <Clock className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    {/* Timestamp + Actions */}
                    <div className={cn("flex items-center gap-2 mt-1", isShop ? "" : "justify-end")}>
                      {isAiBot && (
                        <div className="flex items-center gap-1 text-[9px] text-indigo-400 font-bold bg-indigo-50 px-1.5 py-0.5 rounded-md">
                          <Bot className="w-3 h-3" /> Bot AI
                        </div>
                      )}
                      {isStaff && (
                        <div className="flex items-center gap-1 text-[9px] text-zinc-400 font-semibold bg-zinc-50 px-1.5 py-0.5 rounded-md">
                          <UserCog className="w-3 h-3" /> Nhân viên
                        </div>
                      )}
                      <p className="text-[10px] text-zinc-400">{formatTime(msg.timestamp)}</p>
                      {isComment && msg.sender === "customer" && msg.comment_id && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button onClick={() => { setReplyingTo({ commentId: msg.comment_id, mode: "reply" }); inputRef.current?.focus(); }}
                            className="flex items-center gap-0.5 text-[9px] px-2 py-0.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-all font-medium">
                            <Reply className="w-2.5 h-2.5" /> Reply
                          </button>
                          <button onClick={() => { setReplyingTo({ commentId: msg.comment_id, mode: "private" }); inputRef.current?.focus(); }}
                            className="flex items-center gap-0.5 text-[9px] px-2 py-0.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-all font-medium">
                            <Mail className="w-2.5 h-2.5" /> Nhắn riêng
                          </button>
                          <button onClick={() => onToggleCommentVisibility?.(msg.comment_id, !isHidden)}
                            className={cn("flex items-center gap-0.5 text-[9px] px-2 py-0.5 rounded-full transition-all font-medium",
                              isHidden ? "bg-zinc-200 text-zinc-700 hover:bg-zinc-300" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 border border-zinc-200"
                            )}>
                            {isHidden ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />} 
                            {isHidden ? "Bỏ ẩn" : "Ẩn"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        </ScrollArea>
        {/* Scroll Badge Overlay */}
        <AnimatePresence>
          {showScrollBadge && (
            <motion.button 
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              onClick={scrollToBottom}
              className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border-2 border-white flex items-center gap-1.5 hover:bg-blue-700 transition-colors z-10"
            >
              <ArrowDown className="w-3.5 h-3.5" /> Có tin nhắn mới
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="relative px-5 py-3 border-t border-zinc-100 bg-white">
        {/* Replying indicator */}
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 bg-orange-50 px-3 py-2 rounded-xl border border-orange-200">
            <span className="text-xs font-semibold text-orange-700">
              {replyingTo.mode === "reply" ? "↩ Trả lời comment" : "✉ Nhắn riêng"}
            </span>
            <button onClick={() => setReplyingTo(null)} className="text-orange-400 hover:text-orange-600 ml-auto"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Quick Replies Popup (Command Menu) */}
        {showQR && filteredQR.length > 0 && (
          <div className="absolute bottom-full left-5 right-5 mb-3 bg-white rounded-xl shadow-[0_0_40px_-10px_rgba(0,0,0,0.2)] border border-zinc-200 overflow-hidden z-20 animate-in slide-in-from-bottom-2 fade-in-0 duration-200">
            <div className="p-2.5 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-blue-500" /> Chọn tin nhắn mẫu</span>
              <span className="text-[10px] font-medium text-zinc-400">Dùng ↑ ↓ để chọn ↵ để chèn</span>
            </div>
            <div ref={qrListRef} className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
              {filteredQR.map((qr, index) => (
                <button key={qr.id} onClick={() => selectQuickReply(qr)} onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg transition-colors border border-transparent",
                    index === selectedIndex ? "bg-blue-50/80 border-blue-100 ring-1 ring-blue-500/20" : "hover:bg-zinc-50"
                  )}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0 flex items-center gap-2.5">
                      <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-100/50 px-2 py-0.5 rounded border border-blue-200 shrink-0">/{qr.shortcut}</span>
                      <span className={cn("text-[12px] truncate", index === selectedIndex ? "text-blue-900 font-medium" : "text-zinc-600")}>
                        {qr.content.length > 100 ? qr.content.substring(0, 100) + '...' : qr.content}
                      </span>
                    </div>
                    {qr.image_url && (
                      <div className="shrink-0 flex items-center text-[10px] font-bold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded gap-1">
                        <ImageIcon className="w-3 h-3" /> Ảnh
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Mode Toggle */}
          <div className="flex bg-zinc-100 rounded-lg p-0.5 flex-shrink-0">
            <button onClick={() => setInputMode("send")}
              className={cn("px-2.5 py-1.5 text-[10px] font-semibold rounded-md transition-all flex items-center gap-1",
                inputMode === "send" ? "bg-blue-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700")}>
              <Send className="w-3 h-3" /> Gửi
            </button>
            <button onClick={() => setInputMode("note")}
              className={cn("px-2.5 py-1.5 text-[10px] font-semibold rounded-md transition-all flex items-center gap-1",
                inputMode === "note" ? "bg-amber-400 text-amber-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700")}>
              <StickyNote className="w-3 h-3" /> Ghi chú
            </button>
          </div>

          <input ref={inputRef} type="text" value={inputValue} onChange={handleInputChange} onKeyDown={handleKeyDown}
            placeholder={replyingTo ? (replyingTo.mode === "reply" ? "Nhập trả lời comment..." : "Nhập tin nhắn riêng...") : inputMode === "note" ? "Ghi chú nội bộ (KH không thấy)..." : 'Nhập tin nhắn... (gõ "/" để xem mẫu)'}
            className={cn("flex-1 px-4 py-2.5 rounded-xl text-[13px] outline-none transition-all",
              inputMode === "note" ? "bg-amber-50 border-2 border-amber-300 focus:ring-2 focus:ring-amber-300/30 placeholder:text-amber-400"
              : "bg-zinc-50 border border-zinc-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 placeholder:text-zinc-400"
            )} />

          <button onClick={handleSend}
            className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-md hover:shadow-lg active:scale-95 flex-shrink-0",
              replyingTo ? "bg-orange-500 hover:bg-orange-600" : inputMode === "note" ? "bg-amber-400 hover:bg-amber-500" : "bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            )}>
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
