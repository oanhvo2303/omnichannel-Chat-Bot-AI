"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import CustomerList from "../components/CustomerList";
import ChatWindow from "../components/ChatWindow";
import CustomerDetail from "../components/CustomerDetail";
import QuickRepliesModal from "../components/QuickRepliesModal";
import ProductsModal from "../components/ProductsModal";
import ChatSkeleton from "../components/ChatSkeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Bot, Wifi, WifiOff, Package, BarChart3, Link2, LogOut, Menu, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function DashboardPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [shop, setShop] = useState(null);

  // Tags, Orders, Quick Replies
  const [allTags, setAllTags] = useState([]);
  const [customerTags, setCustomerTags] = useState([]);
  const [orders, setOrders] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQRModal, setShowQRModal] = useState(false);
  const [products, setProducts] = useState([]);
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");

  // Responsive sheets
  const [showMobileList, setShowMobileList] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);

  // Filters
  const [filters, setFilters] = useState({});

  // Notification
  const audioCtxRef = useRef(null);

  const selectedCustomerRef = useRef(null);
  useEffect(() => { selectedCustomerRef.current = selectedCustomer; }, [selectedCustomer]);

  // ---- Auth guard ----
  useEffect(() => {
    const token = localStorage.getItem("token");
    const shopData = localStorage.getItem("shop");
    if (!token || !shopData) { router.push("/login"); return; }
    try { setShop(JSON.parse(shopData)); } catch { router.push("/login"); }
  }, [router]);

  // ---- Auth fetch wrapper ----
  const authFetch = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return null; }
    const res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    if (res.status === 401) { localStorage.removeItem("token"); localStorage.removeItem("shop"); router.push("/login"); return null; }
    return res;
  }, [router]);

  // ---- Load customers (with filters) ----
  const fetchCustomers = useCallback(async (filterOverride) => {
    try {
      const f = filterOverride || filters;
      const params = new URLSearchParams();
      if (f.search) params.set("search", f.search);
      if (f.has_phone) params.set("has_phone", f.has_phone);
      if (f.tag_id) params.set("tag_id", f.tag_id);
      if (selectedPageId) params.set("page_id", selectedPageId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await authFetch(`${API_BASE}/api/customers${qs}`);
      if (res?.ok) { setCustomers(await res.json()); return; }
    } catch (err) { console.warn("[DASHBOARD]", err.message); }
    setCustomers([]);
  }, [authFetch, filters, selectedPageId]);

  useEffect(() => {
    if (shop) {
      fetchCustomers().finally(() => setIsLoading(false));
      authFetch(`${API_BASE}/api/staff`).then(async (res) => {
        if (res?.ok) setStaffList(await res.json());
      }).catch(() => {});
      authFetch(`${API_BASE}/api/pages`).then(async (res) => {
        if (res?.ok) setPages(await res.json());
      }).catch(() => {});
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [shop, fetchCustomers]);

  // ---- Filter change with debounce for search ----
  const filterTimeoutRef = useRef(null);
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current);
    filterTimeoutRef.current = setTimeout(() => { fetchCustomers(newFilters); }, newFilters.search !== filters.search ? 300 : 0);
  };

  // ---- Load messages ----
  const loadMessages = useCallback(async (customerId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/messages/${customerId}`);
      if (res?.ok) { setMessages(await res.json()); return; }
    } catch { /* silent */ }
    setMessages([]);
  }, [authFetch]);

  // ---- Tags ----
  const fetchTags = useCallback(async () => {
    try { const res = await authFetch(`${API_BASE}/api/tags`); if (res?.ok) setAllTags(await res.json()); } catch { /* */ }
  }, [authFetch]);

  useEffect(() => { if (shop) fetchTags(); }, [shop, fetchTags]);

  const fetchCustomerTags = useCallback(async (customerId) => {
    try { const res = await authFetch(`${API_BASE}/api/tags/customer/${customerId}`); if (res?.ok) setCustomerTags(await res.json()); } catch { setCustomerTags([]); }
  }, [authFetch]);

  // ---- Orders ----
  const fetchCustomerOrders = useCallback(async (customerId) => {
    try { const res = await authFetch(`${API_BASE}/api/orders/customer/${customerId}`); if (res?.ok) setOrders(await res.json()); } catch { setOrders([]); }
  }, [authFetch]);

  // ---- Quick Replies ----
  const fetchQuickReplies = useCallback(async () => {
    try { const res = await authFetch(`${API_BASE}/api/quick-replies`); if (res?.ok) setQuickReplies(await res.json()); } catch { /* */ }
  }, [authFetch]);

  useEffect(() => { if (shop) fetchQuickReplies(); }, [shop, fetchQuickReplies]);

  // ---- Products ----
  const fetchProducts = useCallback(async () => {
    try { const res = await authFetch(`${API_BASE}/api/products`); if (res?.ok) setProducts(await res.json()); } catch { /* */ }
  }, [authFetch]);

  useEffect(() => { if (shop) fetchProducts(); }, [shop, fetchProducts]);

  const handleAddProduct = async (form) => {
    const res = await authFetch(`${API_BASE}/api/products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res?.ok) { fetchProducts(); toast({ title: "✅ Thêm sản phẩm", description: form.name }); }
  };
  const handleUpdateProduct = async (id, form) => {
    const res = await authFetch(`${API_BASE}/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res?.ok) { fetchProducts(); toast({ title: "✅ Cập nhật sản phẩm", description: form.name }); }
  };
  const handleDeleteProduct = async (id) => {
    const res = await authFetch(`${API_BASE}/api/products/${id}`, { method: "DELETE" });
    if (res?.ok) { fetchProducts(); toast({ title: "🗑️ Đã xóa sản phẩm" }); }
  };

  const handleAddQuickReply = async (shortcut, content) => {
    const res = await authFetch(`${API_BASE}/api/quick-replies`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut, content }),
    });
    if (res?.ok) { fetchQuickReplies(); toast({ title: "⚡ Thêm tin nhắn mẫu", description: `${shortcut}` }); }
  };

  const handleDeleteQuickReply = async (id) => {
    const res = await authFetch(`${API_BASE}/api/quick-replies/${id}`, { method: "DELETE" });
    if (res?.ok) { fetchQuickReplies(); toast({ title: "🗑️ Đã xóa mẫu" }); }
  };

  // ---- Notification sound (Web Audio API) ----
  const playNotificationTing = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch { /* silent */ }
  }, []);

  // ---- Socket.IO real-time ----
  useEffect(() => {
    if (!shop) return;
    let socket;
    const connectSocket = async () => {
      try {
        const { io } = await import("socket.io-client");
        const token = localStorage.getItem("token");
        socket = io(API_BASE, { 
          transports: ["websocket", "polling"], 
          reconnectionAttempts: 10,
          auth: { token }
        });
        window.__omnichannel_socket = socket;
        socket.on("connect", () => setIsConnected(true));
        socket.on("disconnect", () => setIsConnected(false));
        socket.on("new_message", (data) => {
          if (data.shop_id !== shop.id) return;

          if (data.sender === 'customer' && !data.is_internal) {
            playNotificationTing();
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const title = data.customer_name || 'Khách hàng mới';
              const body = data.text?.substring(0, 100) || 'Tin nhắn mới';
              try { new Notification(`💬 ${title}`, { body, icon: '/favicon.ico', tag: `msg-${data.id}`, silent: true }); } catch { /* */ }
            }
          }

          setCustomers((prev) => {
            const exists = prev.some((c) => c.id === data.customer_id);
            if (!exists) { fetchCustomers(); return prev; }
            return prev.map((c) => c.id === data.customer_id
              ? { ...c, lastMessage: data.text, lastTime: data.timestamp, unread: selectedCustomerRef.current?.id === data.customer_id ? 0 : (c.unread || 0) + 1 }
              : c
            );
          });
          if (data.customer_id === selectedCustomerRef.current?.id) {
            setMessages((prev) => {
              // Tìm tin nhắn đang sending có cùng nội dung
              const sendingIdx = prev.findIndex(m => m.status === 'sending' && m.text === data.text && (data.sender === 'shop' || data.sender === 'bot'));
              if (sendingIdx !== -1) {
                const newArr = [...prev];
                newArr[sendingIdx] = { ...data, status: 'sent' };
                return newArr;
              }
              return [...prev, data];
            });
          }
        });

        // ★★★ AI ERROR HANDLER — Hiển thị Toast đỏ khi AI lỗi ★★★
        socket.on("ai_error", (data) => {
          console.error("[DASHBOARD] 🚨 Nhận được AI Error event:", data);

          // Toast đỏ nổi bật cho Shop Owner
          toast({
            title: "🚨 AI không thể phản hồi khách hàng!",
            description: `${data.error_message || "Lỗi không xác định"}${data.customer_name ? ` — Khách: ${data.customer_name}` : ""}`,
            variant: "destructive",
            duration: 15000, // Giữ 15 giây cho Shop Owner kịp đọc
          });

          // Browser Notification nếu được phép
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification("🚨 AI Bot gặp sự cố!", {
                body: `${data.error_message || "AI không phản hồi được"}. Kiểm tra ngay!`,
                icon: '/favicon.ico',
                tag: `ai-error-${Date.now()}`,
                requireInteraction: true, // Không tự đóng
              });
            } catch { /* silent */ }
          }
        });

        // ★★★ AI ORDER CREATED — Toast + Auto-refresh đơn hàng ★★★
        socket.on("ai_order_created", (data) => {
          console.log("[DASHBOARD] 🎉 AI Order Created:", data);

          toast({
            title: "🤖 AI vừa tự động tạo đơn hàng!",
            description: `Đơn #${data.order_id} — ${data.product_name} x${data.quantity || 1} — ${data.total_amount?.toLocaleString("vi-VN")}đ — Khách: ${data.customer_name || "N/A"}`,
            duration: 10000,
          });

          // Auto-refresh orders nếu đang xem khách này
          const currentCustomer = selectedCustomerRef.current;
          if (currentCustomer && currentCustomer.id === data.customer_id) {
            fetchCustomerOrders(currentCustomer.id);
          }

          // Browser notification
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification("🤖 AI Bot đã tạo đơn hàng!", {
                body: `Đơn #${data.order_id} — ${data.product_name} — ${data.total_amount?.toLocaleString()}đ`,
                icon: '/favicon.ico',
                tag: `ai-order-${data.order_id}`,
              });
            } catch { /* silent */ }
          }
        });

        // ★★★ CUSTOMER TAGS UPDATED — AI auto-tag real-time ★★★
        socket.on("customer_tags_updated", (data) => {
          console.log("[DASHBOARD] 🏷️ Customer tags updated:", data);
          // Auto-refresh tags if viewing this customer
          const currentCustomer = selectedCustomerRef.current;
          if (currentCustomer && currentCustomer.id === data.customer_id) {
            fetchCustomerTags(data.customer_id);
          }
          // Also refresh allTags in case new tags were created by AI
          fetchTags();
        });
      } catch { /* silent */ }
    };
    connectSocket();
    return () => { if (socket) socket.disconnect(); };
  }, [shop, fetchCustomers, playNotificationTing]);

  // ---- Select customer ----
  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    loadMessages(customer.id);
    fetchCustomerTags(customer.id);
    fetchCustomerOrders(customer.id);
    setCustomers((prev) => prev.map((c) => c.id === customer.id ? { ...c, unread: 0 } : c));
    setShowMobileList(false); // Close mobile sheet
  };

  // ---- Send message ----
  const handleSendMessage = async (text) => {
    if (!selectedCustomer || !text.trim()) return;
    
    // Optimistic UI
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      customer_id: selectedCustomer.id,
      sender: 'shop',
      sender_type: 'staff',
      text,
      timestamp: new Date().toISOString(),
      status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const res = await authFetch(`${API_BASE}/api/chat/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: selectedCustomer.id, text })
      });
      if (!res?.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error("Lỗi gửi tin", { description: errData.error || "Token ủy quyền có thể đã hết hạn." });
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
      }
      // Thành công thì cứ để socket new_message thay thế status thành 'sent'
    } catch (error) {
      toast.error("Lỗi mạng", { description: "Mất kết nối với máy chủ Bắn Tin" });
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
    }
  };

  // ---- Tag CRUD ----
  const handleCreateTag = async (name, color) => {
    const res = await authFetch(`${API_BASE}/api/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, color }) });
    if (res?.ok) { fetchTags(); toast({ title: "🏷️ Tạo thẻ mới", description: name }); }
  };
  const handleAssignTag = async (customerId, tagId) => {
    const res = await authFetch(`${API_BASE}/api/tags/customer/${customerId}/${tagId}`, { method: "POST" });
    if (res?.ok) { fetchCustomerTags(customerId); fetchCustomers(); toast({ title: "✅ Gắn thẻ thành công" }); }
  };
  const handleRemoveTag = async (customerId, tagId) => {
    const res = await authFetch(`${API_BASE}/api/tags/customer/${customerId}/${tagId}`, { method: "DELETE" });
    if (res?.ok) { fetchCustomerTags(customerId); fetchCustomers(); toast({ title: "🗑️ Bỏ thẻ" }); }
  };

  // ★ Create tag inline + auto-assign to selected customer
  const handleCreateTagAndAssign = async (tagName) => {
    if (!selectedCustomer || !tagName.trim()) return;
    try {
      // Step 1: Tạo tag mới
      const createRes = await authFetch(`${API_BASE}/api/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tagName.trim() }),
      });
      if (!createRes?.ok) {
        const err = await createRes.json().catch(() => ({}));
        toast({ title: "❌ Lỗi tạo thẻ", description: err.error || "Không thể tạo thẻ", variant: "destructive" });
        return;
      }
      const newTag = await createRes.json();
      const tagId = newTag.id || newTag.tag?.id;

      // Step 2: Gắn tag cho khách
      if (tagId) {
        await authFetch(`${API_BASE}/api/tags/customer/${selectedCustomer.id}/${tagId}`, { method: "POST" });
      }

      // Step 3: Refresh
      fetchTags();
      fetchCustomerTags(selectedCustomer.id);
      toast({ title: "🏷️ Tạo & gắn thẻ mới", description: tagName });
    } catch (err) {
      console.error("[CreateTagAndAssign]", err);
      toast({ title: "❌ Lỗi", variant: "destructive" });
    }
  };

  // ---- Create Order ----
  const handleCreateOrder = async (orderData) => {
    const payload = {
      customer_id: selectedCustomer?.id,
      items: orderData.items,
      note: orderData.note,
      customer_phone: orderData.phone,
      customer_address: orderData.address,
      recipient_name: orderData.recipient_name || selectedCustomer?.name || null,
      discount_amount: orderData.discount_amount || 0,
      discount_type: orderData.discount_type || 'FIXED',
      shipping_fee: orderData.shipping_fee || 0,
    };
    const res = await authFetch(`${API_BASE}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res?.ok) {
      const data = await res.json();
      fetchCustomerOrders(selectedCustomer?.id);
      const parts = [`Tổng: ${data.total_amount?.toLocaleString("vi-VN")}đ`];
      if (data.shipping_fee > 0) parts.push(`Ship: ${data.shipping_fee.toLocaleString("vi-VN")}đ`);
      if (data.discount_amount > 0) parts.push(`Giảm: -${data.discount_amount.toLocaleString("vi-VN")}đ`);
      toast({ title: "🎉 Tạo đơn thành công!", description: parts.join(' | ') });
    } else {
      const errData = await res?.json().catch(() => null);
      toast({ title: "❌ Lỗi tạo đơn", description: errData?.error || "Đã xảy ra lỗi", variant: "destructive" });
    }
  };

  // ---- Logout / Connect Fanpage ----
  const handleLogout = () => { localStorage.removeItem("token"); localStorage.removeItem("shop"); router.push("/login"); };
  const handleConnectFanpage = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/oauth/facebook`);
      if (res?.ok) { const data = await res.json(); window.location.href = data.url; }
    } catch { toast({ title: "❌ Lỗi kết nối", variant: "destructive" }); }
  };

  if (!shop) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-zinc-50 to-white">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg animate-pulse">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <span className="text-zinc-400 text-sm">Đang xác thực...</span>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-zinc-50">
      {/* Compact Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-zinc-200/80">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowMobileList(true)} className="lg:hidden w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors">
            <Menu className="w-4 h-4 text-zinc-600" />
          </button>
          <span className={cn("text-[11px] px-2.5 py-1 rounded-full font-semibold flex items-center gap-1",
            isConnected ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200")}>
            {isConnected ? <><Wifi className="w-3 h-3" /> Live</> : <><WifiOff className="w-3 h-3" /> Offline</>}
          </span>
          <span className="text-[11px] text-zinc-400 font-medium">{customers.length} khách hàng</span>
        </div>
        <div className="flex items-center gap-2">
          {!shop.facebook_page_id && (
            <button onClick={handleConnectFanpage}
              className="text-[11px] px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-semibold transition-all shadow-sm flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" /> Kết nối Fanpage
            </button>
          )}
          <button onClick={() => setShowMobileDetail(true)} className="lg:hidden w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors">
            <Info className="w-4 h-4 text-zinc-600" />
          </button>
        </div>
      </div>

      {/* Main 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Customer List — hidden on mobile, use Sheet */}
        <div className="hidden lg:block w-[330px] flex-shrink-0">
          <CustomerList
            customers={customers} selectedId={selectedCustomer?.id} onSelect={handleSelectCustomer}
            tags={allTags} filters={filters} onFilterChange={handleFilterChange}
            staffList={staffList} userRole={shop?.role || "owner"} pages={pages}
            selectedPageId={selectedPageId} onPageChange={(pageId) => { setSelectedPageId(pageId); }}
            onTransfer={async (customerId, staffId) => {
              const res = await authFetch(`${API_BASE}/api/customers/${customerId}/transfer`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ staff_id: staffId }),
              });
              if (res?.ok) { fetchCustomers(); toast({ title: "🔄 Đã chuyển hội thoại" }); }
            }}
          />
        </div>

        {/* Column 2: Chat Window — always visible */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <ChatSkeleton />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedCustomer?.id || "empty"}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="h-full"
              >
                <ChatWindow
                  messages={messages}
                  customerName={selectedCustomer?.name || (selectedCustomer ? `Khách #${selectedCustomer.platform_id?.slice(-4)}` : null)}
                  onSendMessage={handleSendMessage}
                  quickReplies={quickReplies}
                  onManageQuickReplies={() => setShowQRModal(true)}
                  selectedCustomer={selectedCustomer}
                  staffList={staffList}
                  onTransfer={async (customerId, staffId) => {
                    const res = await authFetch(`${API_BASE}/api/customers/${customerId}/transfer`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ staff_id: staffId }),
                    });
                    if (res?.ok) {
                      const data = await res.json();
                      fetchCustomers();
                      setSelectedCustomer(prev => ({...prev, assigned_to: data.assigned_to}));
                      toast({ title: "🔄 Đã chuyển hội thoại", description: `Hội thoại đã bàn giao cho nhân viên khác.` });
                    }
                  }}
                  onSendInternalNote={async (text) => {
                    if (!selectedCustomer) return;
                    const res = await authFetch(`${API_BASE}/api/messages/internal`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ customer_id: selectedCustomer.id, text }),
                    });
                    if (res?.ok) {
                      toast({ title: "📌 Đã lưu ghi chú" });
                    }
                  }}
                  onReplyComment={async (commentId, text) => {
                    if (!selectedCustomer) return;
                    await authFetch(`${API_BASE}/api/comments/${commentId}/reply`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ text, customer_id: selectedCustomer.id }),
                    });
                    toast({ title: "💬 Đã trả lời comment" });
                  }}
                  onPrivateReply={async (commentId, text) => {
                    if (!selectedCustomer) return;
                    await authFetch(`${API_BASE}/api/comments/${commentId}/private`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ text, customer_id: selectedCustomer.id }),
                    });
                    toast({ title: "✉️ Đã nhắn riêng" });
                  }}
                  onToggleCommentVisibility={async (commentId, isHidden) => {
                    if (!selectedCustomer) return;
                    try {
                      const res = await authFetch(`${API_BASE}/api/comments/${commentId}/visibility`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ is_hidden: isHidden, customer_id: selectedCustomer.id }),
                      });
                      if (res?.ok) {
                        toast({ title: isHidden ? "🙈 Đã ẩn bình luận" : "👁️ Đã hiện bình luận" });
                        setMessages(prev => prev.map(m => m.comment_id === commentId ? { ...m, is_hidden: isHidden ? 1 : 0 } : m));
                      } else {
                        toast({ title: "❌ Lỗi ẩn/hiện bình luận", variant: "destructive" });
                      }
                    } catch {
                      toast({ title: "❌ Lỗi", variant: "destructive" });
                    }
                  }}
                  onToggleAI={async (customerId, isAiPaused) => {
                    if (!shop) return;
                    try {
                      const res = await authFetch(`${API_BASE}/api/customers/${customerId}/ai-status`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ is_ai_paused: isAiPaused }),
                      });
                      if (res?.ok) {
                        const data = await res.json();
                        setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, is_ai_paused: data.is_ai_paused } : c));
                        setSelectedCustomer(prev => prev.id === customerId ? { ...prev, is_ai_paused: data.is_ai_paused } : prev);
                        toast({ title: isAiPaused ? "⏸️ Đã tạm dừng AI cho khách này" : "▶️ Đã bật lại AI" });
                      }
                    } catch {
                      toast({ title: "❌ Lỗi", description: "Không thể đổi trạng thái AI", variant: "destructive" });
                    }
                  }}
                />
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Column 3: Customer Detail — hidden on mobile, use Sheet */}
        <div className="hidden lg:block w-[310px] flex-shrink-0">
          <CustomerDetail
            customer={selectedCustomer} tags={allTags} customerTags={customerTags}
            orders={orders} products={products} messages={messages}
            onToggleTag={(tagId, add) => add ? handleAssignTag(selectedCustomer.id, tagId) : handleRemoveTag(selectedCustomer.id, tagId)}
            onCreateTag={handleCreateTagAndAssign}
            onTagsRefresh={(custId) => fetchCustomerTags(custId)}
            onCreateOrder={(data) => {
              handleCreateOrder({ ...data, customer_id: selectedCustomer.id }).then(() => fetchProducts());
            }}
            onShipOrder={async (orderId, provider, weight) => {
              try {
                const res = await authFetch(`${API_BASE}/api/orders/${orderId}/ship`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ provider, weight }),
                });
                const data = await res.json();
                if (res?.ok) {
                  toast({ title: "🚚 Đẩy vận chuyển thành công!", description: `Mã vận đơn: ${data.tracking_code}` });
                  if (selectedCustomer) fetchCustomerOrders(selectedCustomer.id);
                } else {
                  toast({ title: "❌ Lỗi vận chuyển", description: data.error, variant: "destructive" });
                }
              } catch { toast({ title: "❌ Lỗi kết nối server", variant: "destructive" }); }
            }}
            onOpenProductsModal={() => setShowProductsModal(true)}
            onCustomerUpdated={(updated) => {
              setSelectedCustomer((prev) => ({ ...prev, ...updated }));
              setCustomers((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
            }}
          />
        </div>
      </div>

      {/* Mobile Sheet — Customer List */}
      <Sheet open={showMobileList} onOpenChange={setShowMobileList}>
        <SheetContent side="left" onClose={() => setShowMobileList(false)}>
          <CustomerList
            customers={customers} selectedId={selectedCustomer?.id}
            onSelect={(c) => { handleSelectCustomer(c); setShowMobileList(false); }}
            tags={allTags} filters={filters} onFilterChange={handleFilterChange}
            staffList={staffList} userRole={shop?.role || "owner"} pages={pages}
            selectedPageId={selectedPageId} onPageChange={(pageId) => { setSelectedPageId(pageId); }}
          />
        </SheetContent>
      </Sheet>

      {/* Mobile Sheet — Customer Detail */}
      <Sheet open={showMobileDetail} onOpenChange={setShowMobileDetail}>
        <SheetContent side="right" onClose={() => setShowMobileDetail(false)}>
          <CustomerDetail
            customer={selectedCustomer} tags={allTags} customerTags={customerTags}
            orders={orders} products={products} messages={messages}
            onToggleTag={(tagId, add) => selectedCustomer && (add ? handleAssignTag(selectedCustomer.id, tagId) : handleRemoveTag(selectedCustomer.id, tagId))}
            onCreateTag={handleCreateTagAndAssign}
            onTagsRefresh={(custId) => fetchCustomerTags(custId)}
            onCreateOrder={(data) => {
              if (selectedCustomer) handleCreateOrder({ ...data, customer_id: selectedCustomer.id }).then(() => fetchProducts());
            }}
            onShipOrder={async (orderId, provider, weight) => {
              try {
                const res = await authFetch(`${API_BASE}/api/orders/${orderId}/ship`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ provider, weight }),
                });
                const data = await res.json();
                if (res?.ok) {
                  toast({ title: "🚚 Thành công!", description: `Mã: ${data.tracking_code}` });
                  if (selectedCustomer) fetchCustomerOrders(selectedCustomer.id);
                } else {
                  toast({ title: "❌ Lỗi vận chuyển", description: data.error, variant: "destructive" });
                }
              } catch { toast({ title: "❌ Lỗi", variant: "destructive" }); }
            }}
            onOpenProductsModal={() => setShowProductsModal(true)}
            onCustomerUpdated={(updated) => {
              setSelectedCustomer((prev) => ({ ...prev, ...updated }));
              setCustomers((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Modals */}
      <QuickRepliesModal isOpen={showQRModal} onClose={() => setShowQRModal(false)}
        quickReplies={quickReplies} onAdd={handleAddQuickReply} onDelete={handleDeleteQuickReply} />
      <ProductsModal isOpen={showProductsModal} onClose={() => setShowProductsModal(false)}
        products={products} onAdd={handleAddProduct} onUpdate={handleUpdateProduct} onDelete={handleDeleteProduct} />
    </div>
  );
}
