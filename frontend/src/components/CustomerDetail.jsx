"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSocket } from "@/hooks/useSocket";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  User, Package, StickyNote, Tag, Phone, MapPin, Plus, Minus, Search,
  Truck, ShoppingCart, Save, Loader2, CheckCircle2, Edit3, X, ChevronDown, Sparkles, Percent, Gift, ToggleLeft, ToggleRight
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const authFetch = async (url, opts = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers } });
};

export default function CustomerDetail({
  customer, tags = [], customerTags = [], onToggleTag, onCreateTag,
  orders = [], products = [], onCreateOrder, onShipOrder,
  onOpenProductsModal, onCustomerUpdated, onTagsRefresh
}) {
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderItems, setOrderItems] = useState([]);
  const [orderNote, setOrderNote] = useState("");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountType, setDiscountType] = useState('FIXED'); // 'FIXED' | 'PERCENT'
  const [shippingFee, setShippingFee] = useState(0);
  const [freeshipActive, setFreeshipActive] = useState(false);
  const [shopSettings, setShopSettings] = useState({ default_shipping_fee: 30000, free_shipping_threshold: 500000 });
  const [productSearch, setProductSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);

  // Tag Manager state
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const tagPickerRef = useRef(null);

  // Shipping
  const [shipOrderId, setShipOrderId] = useState(null);
  const [shipProvider, setShipProvider] = useState("GHTK");
  const [shipWeight, setShipWeight] = useState("200");
  const [isShipping, setIsShipping] = useState(false);

  // CRM editable fields
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const debounceRef = useRef(null);

  // Order form phone/address/recipient
  const [orderPhone, setOrderPhone] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [recipientName, setRecipientName] = useState("");

  // Load shop shipping settings on mount
  useEffect(() => {
    authFetch(`${API_BASE}/api/orders/shop-settings`).then(r => r.ok ? r.json() : null).then(data => {
      if (data) setShopSettings(data);
    }).catch(() => {});
  }, []);

  // Sync when customer changes
  useEffect(() => {
    setEditPhone(customer?.phone || "");
    setEditAddress(customer?.address || "");
    setEditNote(customer?.internal_note || "");
    setOrderPhone(customer?.phone || "");
    setOrderAddress(customer?.address || "");
    setRecipientName(customer?.name || "");
    setLastSaved(null);
  }, [customer?.id]);

  // ★ Socket: số điện thoại tự động phát hiện
  useSocket('customer_phone_extracted', (data) => {
    if (data.customer_id === customer?.id && data.phone) {
      setEditPhone(data.phone);
      setOrderPhone(data.phone);
      toast({ title: '📱 Số điện thoại tự động phát hiện!', description: `Regex trích xuất: ${data.phone}` });
    }
  }, [customer?.id]);

  // ★ Socket: AI tự tạo đơn hàng → auto-refresh orders list
  useSocket('ai_order_created', (data) => {
    if (data.customer_id === customer?.id) {
      toast({
        title: '🤖 AI vừa tạo đơn hàng mới!',
        description: `Đơn #${data.order_id} — ${data.product_name} x${data.quantity || 1} — ${data.total_amount?.toLocaleString()}đ`,
      });
      if (onCustomerUpdated) onCustomerUpdated({ ...customer, _refreshOrders: Date.now() });
    }
  }, [customer?.id]);

  // ★ Socket: AI auto-tag → refresh tags in real-time
  useSocket('customer_tags_updated', (data) => {
    if (data.customer_id === customer?.id) {
      onTagsRefresh?.(customer.id);
      if (data.source === 'ai_auto') {
        const tagLabels = (data.tag_names || []).map(t => `[${t}]`).join(' ');
        toast({
          title: data.action === 'add' ? '🏷️ AI đã gắn thẻ' : '🏷️ AI đã gỡ thẻ',
          description: tagLabels,
          duration: 5000,
        });
      }
    }
  }, [customer?.id, onTagsRefresh]);

  // Close tag picker on outside click
  useEffect(() => {
    if (!showTagPicker) return;
    const handleClick = (e) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target)) {
        setShowTagPicker(false);
        setTagSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTagPicker]);

  // Debounce auto-save
  const debounceSave = useCallback((phone, address, note) => {
    if (!customer?.id) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await saveCustomerInfo(phone, address, note);
    }, 1500);
  }, [customer?.id]);

  const saveCustomerInfo = async (phone, address, note) => {
    if (!customer?.id) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/api/customers/${customer.id}`, {
        method: "PATCH",
        body: JSON.stringify({ phone: phone || null, address: address || null, internal_note: note || null }),
      });
      if (res.ok) {
        setLastSaved(new Date());
        onCustomerUpdated?.({ ...customer, phone, address, internal_note: note });
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally { setSaving(false); }
  };

  const handlePhoneChange = (val) => { setEditPhone(val); debounceSave(val, editAddress, editNote); };
  const handleAddressChange = (val) => { setEditAddress(val); debounceSave(editPhone, val, editNote); };
  const handleNoteChange = (val) => { setEditNote(val); debounceSave(editPhone, editAddress, val); };

  const handleManualSave = async () => {
    await saveCustomerInfo(editPhone, editAddress, editNote);
    toast({ title: "✅ Đã lưu thông tin khách hàng" });
  };

  const orderStatusMap = {
    pending: { text: "Chờ xử lý", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    confirmed: { text: "Đã xác nhận", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    shipping: { text: "Đang giao", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    completed: { text: "Hoàn thành", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    cancelled: { text: "Đã hủy", cls: "bg-red-50 text-red-700 border-red-200" },
    returned: { text: "Trả hàng", cls: "bg-zinc-100 text-zinc-600 border-zinc-300" },
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(productSearch.toLowerCase())
  );
  // ★ Volume Pricing: Resolve effective price based on quantity
  const getEffectivePrice = (item) => {
    if (!item.volume_pricing || !Array.isArray(item.volume_pricing) || item.volume_pricing.length === 0) return item.price;
    // Find the best tier: highest min_qty that item.quantity >= min_qty
    let bestPrice = item.price;
    for (const tier of item.volume_pricing) {
      if (item.quantity >= tier.min_qty) bestPrice = tier.price;
    }
    return bestPrice;
  };

  const subtotal = orderItems.reduce((sum, item) => sum + getEffectivePrice(item) * item.quantity, 0);
  const totalQty = orderItems.reduce((sum, item) => sum + item.quantity, 0);

  // Auto shipping fee logic (thỏa 1 trong 2 điều kiện = freeship)
  useEffect(() => {
    if (freeshipActive) {
      setShippingFee(0);
    } else if (
      (shopSettings.free_shipping_threshold > 0 && subtotal >= shopSettings.free_shipping_threshold) ||
      (shopSettings.free_shipping_min_quantity > 0 && totalQty >= shopSettings.free_shipping_min_quantity)
    ) {
      setShippingFee(0);
    } else {
      setShippingFee(shopSettings.default_shipping_fee || 0);
    }
  }, [subtotal, totalQty, freeshipActive, shopSettings]);

  // Calculate discount amount
  const calculatedDiscount = discountType === 'PERCENT'
    ? Math.round(subtotal * Math.min(discountValue, 100) / 100)
    : Math.min(Math.max(0, discountValue), subtotal + shippingFee);

  // ★ CÔNG THỨC CHUẨN: total = subtotal + shipping - discount
  const finalAmount = Math.max(0, subtotal + shippingFee - calculatedDiscount);

  const handleAddProduct = (product) => {
    setOrderItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) return prev.map((i) => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        product_id: product.id, name: product.name,
        price: product.price, quantity: 1, stock: product.stock_quantity,
        volume_pricing: product.volume_pricing || null,
      }];
    });
    setShowProductPicker(false);
    setProductSearch("");
  };

  const handleSubmitOrder = () => {
    if (orderItems.length === 0) return;
    onCreateOrder?.({
      items: orderItems,
      note: orderNote,
      phone: orderPhone,
      address: orderAddress,
      recipient_name: recipientName,
      discount_amount: discountType === 'PERCENT' ? discountValue : calculatedDiscount,
      discount_type: discountType,
      shipping_fee: shippingFee,
      total_amount: finalAmount,
    });
    setShowOrderForm(false);
    setOrderItems([]);
    setOrderNote("");
    setDiscountValue(0);
    setDiscountType('FIXED');
    setFreeshipActive(false);
    setRecipientName(customer?.name || "");
  };

  const handleConfirmShip = async () => {
    setIsShipping(true);
    await onShipOrder?.(shipOrderId, shipProvider, shipWeight);
    setIsShipping(false);
    setShipOrderId(null);
  };

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-zinc-50 to-white border-l border-zinc-200/80">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center">
          <User className="w-8 h-8 text-zinc-400" />
        </div>
        <p className="text-sm font-medium text-zinc-500">Chọn khách hàng</p>
        <p className="text-xs text-zinc-400 mt-1">để xem chi tiết</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-zinc-200/80">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg ring-2 ring-white shadow-lg">
            {customer.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-zinc-900 truncate">{customer.name || `Khách #${customer.platform_id?.slice(-4)}`}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {editPhone && <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" /> {editPhone}</span>}
              <span className="text-[10px] text-zinc-400 capitalize">{customer.platform}</span>
            </div>
          </div>
        </div>

        {/* Tags — Enhanced Multi-select with Popover */}
        <div className="space-y-2">
          {/* Current tags as badges */}
          <div className="flex flex-wrap gap-1.5">
            {customerTags.map((ct) => (
              <span key={ct.id}
                className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm transition-all hover:shadow-md group/tag"
                style={{ backgroundColor: ct.color }}>
                {ct.name}
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleTag?.(ct.id, false); }}
                  className="w-3 h-3 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors opacity-0 group-hover/tag:opacity-100">
                  <X className="w-2 h-2" />
                </button>
              </span>
            ))}

            {/* Add tag button */}
            <div className="relative" ref={tagPickerRef}>
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className="inline-flex items-center gap-0.5 text-[9px] font-bold px-2 py-0.5 rounded-full border border-dashed border-zinc-300 text-zinc-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all">
                <Plus className="w-2.5 h-2.5" /> Thẻ
              </button>

              {/* Tag Picker Popover */}
              {showTagPicker && (
                <div className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl border border-zinc-200 shadow-xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95">
                  {/* Search / Create input */}
                  <div className="p-2 border-b border-zinc-100">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 rounded-lg border border-zinc-200">
                      <Search className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                      <input
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && tagSearch.trim()) {
                            // Create new tag inline
                            const exists = tags.find(t => t.name.toLowerCase() === tagSearch.trim().toLowerCase());
                            if (exists) {
                              // Tag exists → assign it
                              const alreadyAssigned = customerTags.some(ct => ct.id === exists.id);
                              if (!alreadyAssigned) onToggleTag?.(exists.id, true);
                            } else {
                              // Create new tag and assign
                              onCreateTag?.(tagSearch.trim());
                            }
                            setTagSearch("");
                            setShowTagPicker(false);
                          }
                        }}
                        placeholder="Tìm hoặc tạo thẻ mới..."
                        className="flex-1 text-[11px] bg-transparent outline-none placeholder:text-zinc-400"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Tag list */}
                  <div className="max-h-36 overflow-y-auto p-1.5">
                    {tags
                      .filter(t => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                      .filter(t => !customerTags.some(ct => ct.id === t.id))
                      .map((tag) => (
                        <button key={tag.id}
                          onClick={() => {
                            onToggleTag?.(tag.id, true);
                            setTagSearch("");
                            setShowTagPicker(false);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg hover:bg-zinc-50 transition-colors text-left group">
                          <div className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className="text-zinc-700 font-medium">{tag.name}</span>
                        </button>
                      ))}

                    {/* Create new option */}
                    {tagSearch.trim() && !tags.some(t => t.name.toLowerCase() === tagSearch.trim().toLowerCase()) && (
                      <button
                        onClick={() => {
                          onCreateTag?.(tagSearch.trim());
                          setTagSearch("");
                          setShowTagPicker(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg hover:bg-blue-50 transition-colors text-left border-t border-zinc-100 mt-1 pt-2">
                        <Sparkles className="w-3 h-3 text-blue-500" />
                        <span className="text-blue-600 font-semibold">Tạo thẻ "{tagSearch.trim()}"</span>
                      </button>
                    )}

                    {/* Empty state */}
                    {tags.filter(t => !customerTags.some(ct => ct.id === t.id)).length === 0 && !tagSearch && (
                      <div className="text-center py-3 text-[10px] text-zinc-400">
                        Tất cả thẻ đã được gắn
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-2">
          <TabsList>
            <TabsTrigger value="info"><User className="w-3 h-3 mr-1" /> Thông tin</TabsTrigger>
            <TabsTrigger value="orders"><Package className="w-3 h-3 mr-1" /> Đơn hàng</TabsTrigger>
            <TabsTrigger value="notes"><StickyNote className="w-3 h-3 mr-1" /> Ghi chú</TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1 px-4">
          {/* ==================== TAB: Info ==================== */}
          <TabsContent value="info" className="space-y-3 pb-4">
            {/* Editable Phone */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Phone className="w-3 h-3" /> Số điện thoại
              </label>
              <input value={editPhone} onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="0912 345 678"
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all" />
            </div>

            {/* Editable Address */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Địa chỉ giao hàng
              </label>
              <input value={editAddress} onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="123 Nguyễn Huệ, Q.1, TP.HCM"
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all" />
            </div>

            {/* Platform info */}
            <div className="bg-zinc-50 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <Tag className="w-3 h-3 text-zinc-400" />
                <span className="capitalize">{customer.platform}</span>
                <span className="text-zinc-300">•</span>
                <span className="font-mono text-[10px] text-zinc-400">{customer.platform_id?.slice(-8)}</span>
              </div>
              <div className="text-[10px] text-zinc-400">
                Khách từ: {new Date(customer.created_at).toLocaleDateString("vi-VN")}
              </div>
            </div>

            {/* Save indicator */}
            <div className="flex items-center justify-between">
              <button onClick={handleManualSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 transition-all">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {saving ? "Đang lưu..." : "Lưu thông tin"}
              </button>
              {lastSaved && (
                <span className="text-[9px] text-emerald-600 flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Đã lưu {lastSaved.toLocaleTimeString("vi-VN")}
                </span>
              )}
            </div>

            {/* Products modal shortcut */}
            <button onClick={onOpenProductsModal}
              className="w-full py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-100 transition-all">
              <Package className="w-3.5 h-3.5 inline mr-1" /> Quản lý kho sản phẩm
            </button>
          </TabsContent>

          {/* ==================== TAB: Orders ==================== */}
          <TabsContent value="orders" className="pb-4">
            <button onClick={() => setShowOrderForm(true)}
              className="w-full py-2.5 mb-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5" /> Tạo đơn hàng
            </button>

            {orders.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 text-xs">Chưa có đơn hàng</div>
            ) : (
              <div className="space-y-2">
                {orders.map((order) => {
                  const s = orderStatusMap[order.status] || orderStatusMap.pending;
                  return (
                    <div key={order.id} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100 hover:border-zinc-200 transition-all">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-zinc-800">Đơn #{order.id}</span>
                          {order.marketplace_source === 'shopee' && <span className="text-[8px] font-bold px-1.5 py-0.5 bg-[#EE4D2D] text-white rounded-full">Shopee</span>}
                          {order.marketplace_source === 'tiktok' && <span className="text-[8px] font-bold px-1.5 py-0.5 bg-[#010101] text-white rounded-full">TikTok</span>}
                        </div>
                        <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", s.cls)}>{s.text}</span>
                      </div>
                      {order.marketplace_order_id && <div className="text-[9px] text-zinc-400 mb-1">Mã sàn: {order.marketplace_order_id}</div>}
                      {order.marketplace_status && <div className="text-[9px] font-medium text-blue-600 mb-1">📦 {order.marketplace_status}</div>}
                      {order.items?.map((item, i) => (
                        <div key={i} className="flex justify-between text-[11px] text-zinc-600"><span>{item.name} ×{item.quantity}</span><span>{(item.price * item.quantity).toLocaleString("vi-VN")}đ</span></div>
                      ))}
                      <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-zinc-200">
                        <span className="text-[9px] text-zinc-400">{new Date(order.created_at).toLocaleDateString("vi-VN")}</span>
                        <span className="text-xs font-bold text-blue-700">{order.total_amount?.toLocaleString("vi-VN")}đ</span>
                      </div>
                      {order.tracking_code ? (
                        <div className="mt-1.5 flex items-center gap-1.5 bg-emerald-50 rounded-lg px-2.5 py-1.5 border border-emerald-200">
                          <Truck className="w-3 h-3 text-emerald-600" />
                          <span className="text-[10px] font-bold text-emerald-700">{order.shipping_provider}: {order.tracking_code}</span>
                        </div>
                      ) : !order.marketplace_source && (order.status === 'pending' || order.status === 'confirmed') && (
                        <button onClick={() => setShipOrderId(order.id)}
                          className="mt-1.5 w-full py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-[10px] font-bold rounded-lg transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-1">
                          <Truck className="w-3 h-3" /> 🚀 Đẩy Đơn Vận Chuyển
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ==================== TAB: Ghi chú nội bộ ==================== */}
          <TabsContent value="notes" className="pb-4 space-y-3">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <StickyNote className="w-3 h-3" /> Ghi chú nội bộ (chỉ nhân viên thấy)
              </label>
              <textarea value={editNote} onChange={(e) => handleNoteChange(e.target.value)} rows={5}
                placeholder="Ghi chú riêng về khách hàng... VD: Khách VIP, hay mua áo size L, đã hẹn gọi lại lúc 3h chiều..."
                className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 resize-none leading-relaxed" />
            </div>

            {/* Save indicator */}
            <div className="flex items-center justify-between">
              <button onClick={handleManualSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200 transition-all">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {saving ? "Đang lưu..." : "Lưu ghi chú"}
              </button>
              {lastSaved && (
                <span className="text-[9px] text-emerald-600 flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Đã lưu {lastSaved.toLocaleTimeString("vi-VN")}
                </span>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10px] text-amber-700">
              <p className="font-semibold mb-1">💡 Mẹo:</p>
              <p>• Ghi chú sẽ <strong>auto-save</strong> sau 1.5 giây ngừng gõ</p>
              <p>• Khách hàng <strong>KHÔNG</strong> nhìn thấy nội dung này</p>
              <p>• Để ghi chú hiện trong chat → dùng chế độ &quot;Ghi chú&quot; ở khung nhập tin</p>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* ==================== Order Dialog ==================== */}
      <Dialog open={showOrderForm} onOpenChange={setShowOrderForm}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-blue-600" /> Tạo đơn hàng</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Product Picker */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Sản phẩm</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setShowProductPicker(true); }}
                  onFocus={() => setShowProductPicker(true)} placeholder="Tìm sản phẩm (tên hoặc SKU)..."
                  className="w-full px-4 py-2 pl-9 bg-zinc-50 border border-zinc-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
                {showProductPicker && filteredProducts.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-36 overflow-y-auto">
                    {filteredProducts.map((p) => (
                      <button key={p.id} onClick={() => handleAddProduct(p)}
                        className={cn("w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b border-zinc-50 last:border-0 transition-colors",
                          p.stock_quantity === 0 && "opacity-40 cursor-not-allowed")}
                        disabled={p.stock_quantity === 0}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-800">{p.name}</span>
                          <span className="text-blue-600 font-bold">{p.price?.toLocaleString("vi-VN")}đ</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.sku && <span className="text-[9px] text-zinc-400 font-mono">{p.sku}</span>}
                          <span className={cn("text-[9px] font-bold", p.stock_quantity > 0 ? "text-emerald-600" : "text-red-500")}>
                            Kho: {p.stock_quantity}
                          </span>
                          {p.volume_pricing && p.volume_pricing.length > 0 && (
                            <span className="text-[8px] font-bold text-violet-600 bg-violet-50 px-1 py-0.5 rounded">Giá sỉ</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cart items */}
            {orderItems.length > 0 && (
              <div className="space-y-1.5">
                {orderItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-zinc-50 rounded-xl px-3 py-2 border border-zinc-100">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button onClick={() => setOrderItems((prev) => prev.filter((_, idx) => idx !== i))}
                        className="w-5 h-5 rounded-md bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center flex-shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-medium text-zinc-800 truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => setOrderItems((prev) => prev.map((it, idx) => idx === i ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it))}
                        className="w-6 h-6 rounded-lg bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center transition-colors"><Minus className="w-3 h-3" /></button>
                      <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                      <button onClick={() => setOrderItems((prev) => prev.map((it, idx) => idx === i ? { ...it, quantity: it.quantity + 1 } : it))}
                        className="w-6 h-6 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center transition-colors"><Plus className="w-3 h-3" /></button>
                      <div className="ml-1 text-right w-20">
                        <span className="text-xs font-bold text-blue-700">{(getEffectivePrice(item) * item.quantity).toLocaleString("vi-VN")}đ</span>
                        {getEffectivePrice(item) < item.price && (
                          <div className="flex items-center gap-0.5 justify-end">
                            <span className="text-[8px] text-zinc-400 line-through">{item.price.toLocaleString('vi-VN')}</span>
                            <span className="text-[8px] text-violet-600 font-bold">{getEffectivePrice(item).toLocaleString('vi-VN')}/sp</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* ★ BILL SECTION — E-commerce Standard (4 dòng) */}
                <div className="mt-3 bg-gradient-to-b from-zinc-50 to-white border border-zinc-200 rounded-2xl overflow-hidden">
                  <div className="border-b border-dashed border-zinc-300 mx-3" />
                  
                  {/* 1. Tạm tính (Subtotal) */}
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-xs text-zinc-500">Tạm tính ({orderItems.reduce((s, i) => s + i.quantity, 0)} sản phẩm)</span>
                    <span className="text-xs font-semibold text-zinc-700">{subtotal.toLocaleString("vi-VN")}đ</span>
                  </div>

                  {/* 2. Phí giao hàng (Shipping) */}
                  <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3 h-3 text-blue-500" />
                      <span className="text-xs font-semibold text-blue-600">Phí giao hàng</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {freeshipActive ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] line-through text-zinc-400">{shopSettings.default_shipping_fee?.toLocaleString('vi-VN')}đ</span>
                          <span className="text-xs font-bold text-emerald-600">0đ</span>
                        </div>
                      ) : (
                        <div className="relative w-24">
                          <input type="number" min={0} value={shippingFee || ''}
                            onChange={(e) => { setShippingFee(Math.max(0, parseInt(e.target.value) || 0)); setFreeshipActive(false); }}
                            placeholder="0"
                            className="w-full text-right pr-5 pl-2 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20" />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-blue-400">đ</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Giảm giá (Discount) */}
                  <div className="px-4 py-2 border-t border-zinc-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Percent className="w-3 h-3 text-orange-500" />
                        <span className="text-xs font-semibold text-orange-600">Giảm giá</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Toggle đ / % */}
                        <button onClick={() => setDiscountType(discountType === 'FIXED' ? 'PERCENT' : 'FIXED')}
                          className={cn("px-2 py-0.5 text-[10px] font-bold rounded-md border transition-all",
                            discountType === 'PERCENT' ? 'bg-violet-500 text-white border-violet-500' : 'bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-200'
                          )}>
                          {discountType === 'PERCENT' ? '%' : 'đ'}
                        </button>
                        <div className="relative w-24">
                          <input type="number" min={0} max={discountType === 'PERCENT' ? 100 : subtotal + shippingFee}
                            value={discountValue || ''}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              if (discountType === 'PERCENT') setDiscountValue(Math.min(v, 100));
                              else setDiscountValue(Math.min(v, subtotal + shippingFee));
                            }}
                            placeholder="0"
                            className="w-full text-right pr-5 pl-2 py-1 text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500/20" />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-orange-400">
                            {discountType === 'PERCENT' ? '%' : 'đ'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Hiển thị số tiền giảm thực tế khi dùng % */}
                    {discountType === 'PERCENT' && discountValue > 0 && (
                      <div className="text-right mb-1.5">
                        <span className="text-[10px] text-orange-500">= -{calculatedDiscount.toLocaleString('vi-VN')}đ</span>
                      </div>
                    )}
                    {/* Quick discount buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {[10000, 20000, 30000, 50000].map((val) => (
                        <button key={val} onClick={() => { setDiscountType('FIXED'); setDiscountValue(Math.min(val, subtotal + shippingFee)); }}
                          className={cn("px-2 py-0.5 text-[10px] font-bold rounded-lg border transition-all",
                            discountType === 'FIXED' && discountValue === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-orange-600 border-orange-200 hover:bg-orange-50"
                          )}>
                          -{(val / 1000)}k
                        </button>
                      ))}
                      <button onClick={() => { setFreeshipActive(true); setShippingFee(0); }}
                        className={cn("px-2 py-0.5 text-[10px] font-bold rounded-lg border transition-all flex items-center gap-0.5",
                          freeshipActive ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        )}>
                        <Gift className="w-2.5 h-2.5" /> Freeship
                      </button>
                      {(discountValue > 0 || freeshipActive) && (
                        <button onClick={() => { setDiscountValue(0); setFreeshipActive(false); }}
                          className="px-2 py-0.5 text-[10px] font-bold rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-all">
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 4. Khách cần trả (Final Total) */}
                  <div className="flex justify-between items-center px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border-t border-emerald-200">
                    <span className="text-sm font-bold text-emerald-800">Khách cần trả</span>
                    <div className="text-right">
                      {(calculatedDiscount > 0 || shippingFee > 0) && (
                        <span className="text-[10px] text-zinc-400 block">
                          {subtotal.toLocaleString('vi-VN')} {shippingFee > 0 ? `+ ${shippingFee.toLocaleString('vi-VN')}` : ''} {calculatedDiscount > 0 ? `- ${calculatedDiscount.toLocaleString('vi-VN')}` : ''}
                        </span>
                      )}
                      <span className="text-lg font-black text-emerald-700">{finalAmount.toLocaleString("vi-VN")}đ</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recipient Name + Phone (2 columns) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1">
                  <User className="w-3 h-3 inline mr-1" />Tên người nhận
                </label>
                <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Tên thật của khách..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
                {recipientName && recipientName !== customer?.name && (
                  <p className="text-[9px] text-amber-500 mt-0.5">Đã sửa từ: {customer?.name}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1">
                  <Phone className="w-3 h-3 inline mr-1" />SĐT
                </label>
                <input value={orderPhone} onChange={(e) => setOrderPhone(e.target.value)}
                  placeholder="0912345678"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
              </div>
            </div>

            {/* Address (full width) */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1">
                <MapPin className="w-3 h-3 inline mr-1" />Địa chỉ giao hàng
              </label>
              <input value={orderAddress} onChange={(e) => setOrderAddress(e.target.value)}
                placeholder="Số nhà, đường, quận, thành phố..."
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
            </div>

            <textarea value={orderNote} onChange={(e) => setOrderNote(e.target.value)} rows={2} placeholder="Ghi chú đơn hàng..."
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 resize-none" />

            <button onClick={handleSubmitOrder} disabled={orderItems.length === 0}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Chốt đơn ({finalAmount.toLocaleString("vi-VN")}đ)
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== Shipping Dialog ==================== */}
      <Dialog open={!!shipOrderId} onOpenChange={(open) => !open && setShipOrderId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600"><Truck className="w-5 h-5" /> Giao hàng</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1">Nhà vận chuyển</label>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setShipProvider("GHTK")} className={cn("py-2 rounded-lg text-xs font-bold border-2 transition-all", shipProvider === "GHTK" ? "border-green-500 bg-green-50 text-green-700" : "border-zinc-200 text-zinc-500")}>GHTK</button>
                <button onClick={() => setShipProvider("GHN")} className={cn("py-2 rounded-lg text-xs font-bold border-2 transition-all", shipProvider === "GHN" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-zinc-200 text-zinc-500")}>GHN</button>
                <button onClick={() => setShipProvider("VIETTEL_POST")} className={cn("py-2 rounded-lg text-xs font-bold border-2 transition-all", shipProvider === "VIETTEL_POST" ? "border-red-500 bg-red-50 text-red-700" : "border-zinc-200 text-zinc-500")}>Viettel</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1">Khối lượng (gram)</label>
              <input type="number" value={shipWeight} onChange={e => setShipWeight(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
            </div>
            <button onClick={handleConfirmShip} disabled={isShipping} className="w-full py-2.5 mt-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2">
              {isShipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />} Xác Nhận Đẩy Đơn
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
