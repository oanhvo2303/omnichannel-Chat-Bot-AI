"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  ClipboardList, Search, Package, Truck, Phone, MapPin,
  ChevronLeft, ChevronRight, Copy, Check, Loader2, RefreshCw,
  ArrowUpDown, ArrowUp, ArrowDown, StickyNote, Bot, User, Calendar,
  Hash, ShoppingBag, CreditCard, X, Rocket, Printer, XCircle,
  Weight, Banknote, MessageSquare, Pencil, Save, Eye
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const authFetch = async (url, opts = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
};

// =============================================
// Status Badge Config
// =============================================
const STATUS_CONFIG = {
  pending:    { label: "Chờ xử lý",   color: "bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10", dot: "bg-amber-500" },
  confirmed:  { label: "Đã xác nhận", color: "bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/10", dot: "bg-blue-500" },
  shipping:   { label: "Đang giao",   color: "bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/10", dot: "bg-indigo-500" },
  completed:  { label: "Hoàn thành",  color: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10", dot: "bg-emerald-500" },
  cancelled:  { label: "Đã hủy",     color: "bg-red-50 text-red-700 border-red-200 ring-red-500/10", dot: "bg-red-500" },
  returned:   { label: "Trả hàng",    color: "bg-zinc-100 text-zinc-600 border-zinc-300 ring-zinc-500/10", dot: "bg-zinc-500" },
};

const SHIPPING_PROVIDERS = {
  GHTK: { label: "GHTK", color: "text-green-700 bg-green-50 border-green-200", fullName: "Giao Hàng Tiết Kiệm" },
  GHN:  { label: "GHN", color: "text-orange-700 bg-orange-50 border-orange-200", fullName: "Giao Hàng Nhanh" },
  VIETTEL_POST: { label: "VTP", color: "text-red-700 bg-red-50 border-red-200", fullName: "Viettel Post" },
};

// =============================================
// Helper: Parse UTC timestamp → local time
// =============================================
const parseTimestamp = (ts) => {
  if (!ts) return null;
  if (ts.includes('Z') || ts.includes('+')) return new Date(ts);
  return new Date(ts.replace(' ', 'T') + 'Z');
};

const formatDate = (ts) => {
  const d = parseTimestamp(ts);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const formatDateTime = (ts) => {
  const d = parseTimestamp(ts);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return "0đ";
  return `${Number(amount).toLocaleString("vi-VN")}đ`;
};

// =============================================
// Component: Status Badge
// =============================================
function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full border ring-1",
      config.color
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", config.dot)} />
      {config.label}
    </span>
  );
}

// =============================================
// Component: Copyable tracking code
// =============================================
function TrackingCode({ code, provider }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  };

  if (!code) return <span className="text-[11px] text-zinc-400">—</span>;

  const providerConfig = SHIPPING_PROVIDERS[provider] || { label: provider || "N/A", color: "text-zinc-600 bg-zinc-50 border-zinc-200" };

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md border", providerConfig.color)}>
        {providerConfig.label}
      </span>
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200 transition-all"
        title="Click để copy mã vận đơn"
      >
        {code.substring(0, 16)}{code.length > 16 ? "…" : ""}
        {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

// =============================================
// Component: SHIPPING DIALOG MODAL
// =============================================
// Loại hình dịch vụ VTP
const VTP_SERVICES = [
  { value: "VCN",  label: "Chuyển Nhanh",   desc: "1-2 ngày",     icon: "⚡" },
  { value: "VTK",  label: "Tiết Kiệm",      desc: "3-5 ngày",     icon: "💰" },
  { value: "VHT",  label: "Hỏa Tốc",        desc: "Nội thành",    icon: "🔥" },
  { value: "PTN",  label: "Phát Trong Ngày", desc: "Same-day",     icon: "📦" },
  { value: "PHS",  label: "Phát Hàng Sáng",  desc: "Trước 12h",    icon: "🌅" },
  { value: "LCOD", label: "LCOD",            desc: "COD Liên tỉnh",icon: "💵" },
  { value: "NCOD", label: "NCOD",            desc: "COD Nội tỉnh", icon: "💴" },
  { value: "SCOD", label: "SCOD",            desc: "COD Nhanh",    icon: "💳" },
  { value: "VCOD", label: "VCOD",            desc: "COD Chuẩn",    icon: "🏷️" },
];

// Loại hình dịch vụ GHN
const GHN_SERVICES = [
  { value: 2, label: "Hàng nhẹ",    desc: "E-Commerce" },
  { value: 5, label: "Hàng nặng",   desc: "Traditional" },
];

// Yêu cầu giao hàng GHN (bắt buộc theo API)
const GHN_REQUIRED_NOTES = [
  { value: "CHOTHUHANG",          label: "Cho thử hàng" },
  { value: "CHOXEMHANGKHONGTHU",  label: "Cho xem, không thử" },
  { value: "KHONGCHOXEMHANG",     label: "Không cho xem hàng" },
];

function ShippingModal({ order, onClose, onSuccess }) {
  const [provider, setProvider] = useState("GHTK");
  const [weight, setWeight] = useState(500);
  const [codAmount, setCodAmount] = useState(order?.total_amount || 0);
  const [shipperNote, setShipperNote] = useState("");
  const [vtpService, setVtpService] = useState("VCN");
  const [ghnServiceType, setGhnServiceType] = useState(2);
  const [ghnRequiredNote, setGhnRequiredNote] = useState("CHOXEMHANGKHONGTHU");
  const [loading, setLoading] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load defaults từ Settings → Cấu hình vận chuyển
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/integrations/shipping-config`);
        if (res.ok) {
          const { config } = await res.json();
          const vtpMeta = config?.viettel_post?.metadata || {};
          const ghnMeta = config?.ghn?.metadata || {};
          if (vtpMeta.service) setVtpService(vtpMeta.service);
          if (ghnMeta.service_type_id) setGhnServiceType(ghnMeta.service_type_id);
          if (ghnMeta.required_note) setGhnRequiredNote(ghnMeta.required_note);
          const dw = vtpMeta.default_weight || ghnMeta.default_weight;
          if (dw) setWeight(dw);
        }
      } catch { /* silent */ }
      setConfigLoaded(true);
    })();
  }, []);

  if (!order) return null;

  const items = order.items || [];
  const itemsSummary = items.map(i => `${i.name} ×${i.quantity}`).join(", ");

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/orders/${order.id}/ship`, {
        method: "POST",
        body: JSON.stringify({
          provider,
          weight,
          cod_amount: codAmount,
          shipper_note: shipperNote,
          // VTP-specific
          vtp_service: provider === "VIETTEL_POST" ? vtpService : undefined,
          // GHN-specific
          ghn_service_type_id: provider === "GHN" ? ghnServiceType : undefined,
          ghn_required_note: provider === "GHN" ? ghnRequiredNote : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Đẩy đơn thất bại");
      }

      toast({
        title: "🚀 Đã đẩy đơn thành công!",
        description: `Mã vận đơn: ${data.tracking_code}${data.is_mock ? " (Mock)" : ""}${data.fee ? ` — Phí: ${formatCurrency(data.fee)}` : ""}`,
        duration: 8000,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("[Shipping] Error:", err);
      toast({
        title: "❌ Lỗi đẩy đơn vận chuyển",
        description: err.message,
        variant: "destructive",
        duration: 6000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-600">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Đẩy Giao Hàng</h2>
                <p className="text-xs text-indigo-200">Đơn #{order.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Order Summary */}
          <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-200">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Khách hàng</p>
                  <p className="font-medium text-zinc-800">{order.recipient_name || order.customer_name || "N/A"}</p>
                  {order.recipient_name && order.recipient_name !== order.customer_name && (
                    <p className="text-[9px] text-amber-500">FB: {order.customer_name}</p>
                  )}
                  {order.customer_phone && <p className="text-[11px] text-zinc-500">{order.customer_phone}</p>}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CreditCard className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Tổng tiền</p>
                  <p className="font-bold text-emerald-700 text-lg">{formatCurrency(order.total_amount)}</p>
                  {/* Pricing breakdown */}
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {order.subtotal > 0 && order.subtotal !== order.total_amount && (
                      <span className="text-[9px] text-zinc-400">Hàng: {formatCurrency(order.subtotal)}</span>
                    )}
                    {order.shipping_fee > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-md">
                        +Ship {formatCurrency(order.shipping_fee)}
                      </span>
                    )}
                    {order.discount_amount > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-md">
                        -{formatCurrency(order.discount_amount)}{order.discount_type === 'PERCENT' ? '' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-span-2 flex items-start gap-2">
                <ShoppingBag className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Sản phẩm</p>
                  <p className="text-[12px] text-zinc-700">{itemsSummary || "—"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="px-6 py-5 space-y-4">
            {/* Provider Select */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                <Truck className="w-3.5 h-3.5" /> Đơn vị vận chuyển
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(SHIPPING_PROVIDERS).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setProvider(key)}
                    className={cn(
                      "py-2.5 px-3 rounded-xl border-2 text-center transition-all",
                      provider === key
                        ? "border-blue-500 bg-blue-50 shadow-sm shadow-blue-200"
                        : "border-zinc-200 hover:border-zinc-300 bg-white"
                    )}
                  >
                    <span className={cn("text-[11px] font-bold", provider === key ? "text-blue-700" : "text-zinc-700")}>
                      {cfg.label}
                    </span>
                    <p className="text-[9px] text-zinc-400 mt-0.5">{cfg.fullName}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* ── VTP Service Type (chỉ hiện khi chọn VTP) ── */}
            {provider === "VIETTEL_POST" && (
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  <Package className="w-3.5 h-3.5" /> Loại hình dịch vụ VTP
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {VTP_SERVICES.map((svc) => (
                    <button
                      key={svc.value}
                      onClick={() => setVtpService(svc.value)}
                      className={cn(
                        "py-2 px-2 rounded-lg border-2 text-center transition-all",
                        vtpService === svc.value
                          ? "border-red-500 bg-red-50 shadow-sm shadow-red-200"
                          : "border-zinc-200 hover:border-zinc-300 bg-white"
                      )}
                    >
                      <span className="text-sm">{svc.icon}</span>
                      <p className={cn("text-[10px] font-bold mt-0.5", vtpService === svc.value ? "text-red-700" : "text-zinc-700")}>
                        {svc.label}
                      </p>
                      <p className="text-[8px] text-zinc-400">{svc.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── GHN Service Type + Required Note (chỉ hiện khi chọn GHN) ── */}
            {provider === "GHN" && (
              <div className="space-y-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                    <Package className="w-3.5 h-3.5" /> Loại hình GHN
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {GHN_SERVICES.map((svc) => (
                      <button
                        key={svc.value}
                        onClick={() => setGhnServiceType(svc.value)}
                        className={cn(
                          "py-2 px-3 rounded-lg border-2 text-center transition-all",
                          ghnServiceType === svc.value
                            ? "border-orange-500 bg-orange-50 shadow-sm shadow-orange-200"
                            : "border-zinc-200 hover:border-zinc-300 bg-white"
                        )}
                      >
                        <p className={cn("text-[11px] font-bold", ghnServiceType === svc.value ? "text-orange-700" : "text-zinc-700")}>
                          {svc.label}
                        </p>
                        <p className="text-[9px] text-zinc-400">{svc.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                    <Eye className="w-3.5 h-3.5" /> Yêu cầu giao hàng
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {GHN_REQUIRED_NOTES.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setGhnRequiredNote(opt.value)}
                        className={cn(
                          "py-2 px-2 rounded-lg border-2 text-center transition-all",
                          ghnRequiredNote === opt.value
                            ? "border-orange-500 bg-orange-50"
                            : "border-zinc-200 hover:border-zinc-300 bg-white"
                        )}
                      >
                        <p className={cn("text-[10px] font-bold", ghnRequiredNote === opt.value ? "text-orange-700" : "text-zinc-600")}>
                          {opt.label}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Weight */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  <Weight className="w-3.5 h-3.5" /> Khối lượng (gram)
                </label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  min={100}
                  max={50000}
                  className="w-full px-3 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
                />
              </div>

              {/* COD Amount */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  <Banknote className="w-3.5 h-3.5" /> Tiền thu hộ (COD)
                </label>
                <input
                  type="number"
                  value={codAmount}
                  onChange={(e) => setCodAmount(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
                />
              </div>
            </div>

            {/* Shipper Note */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                <MessageSquare className="w-3.5 h-3.5" /> Ghi chú cho Shipper
              </label>
              <input
                value={shipperNote}
                onChange={(e) => setShipperNote(e.target.value)}
                placeholder="VD: Cho khách xem hàng, Không cho thử..."
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all"
            >
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all shadow-lg",
                loading
                  ? "bg-zinc-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-blue-500/30 hover:shadow-blue-500/40"
              )}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Đang đẩy đơn...</>
              ) : (
                <><Rocket className="w-4 h-4" /> Xác nhận Đẩy Đơn</>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// =============================================
// Component: EDIT ORDER MODAL
// =============================================
function EditOrderModal({ order, onClose, onSuccess }) {
  const [customerPhone, setCustomerPhone] = useState(order?.customer_phone || "");
  const [customerAddress, setCustomerAddress] = useState(order?.customer_address || "");
  const [note, setNote] = useState(order?.note || "");
  const [totalAmount, setTotalAmount] = useState(order?.total_amount || 0);
  const [loading, setLoading] = useState(false);

  if (!order) return null;

  const items = order.items || [];
  const itemsSummary = items.map(i => `${i.name} ×${i.quantity}`).join(", ");

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          customer_phone: customerPhone,
          customer_address: customerAddress,
          note,
          total_amount: totalAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi cập nhật");

      toast({ title: "✅ Đã cập nhật đơn hàng #" + order.id });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Pencil className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Chỉnh sửa Đơn hàng</h2>
                <p className="text-xs text-amber-100">Đơn #{order.id} — {order.customer_name || "N/A"}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Order info (readonly) */}
          <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-200">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingBag className="w-4 h-4 text-zinc-400" />
              <span className="text-[11px] text-zinc-500">{itemsSummary || "Không có sản phẩm"}</span>
            </div>
          </div>

          {/* Editable Fields */}
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  <Phone className="w-3.5 h-3.5" /> Số điện thoại
                </label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0912345678"
                  className="w-full px-3 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 transition-all"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  <CreditCard className="w-3.5 h-3.5" /> Tổng tiền (VNĐ)
                </label>
                <input
                  type="number"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                <MapPin className="w-3.5 h-3.5" /> Địa chỉ giao hàng
              </label>
              <input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="123 Nguyễn Huệ, Quận 1, TP.HCM"
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 transition-all"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                <StickyNote className="w-3.5 h-3.5" /> Yêu cầu của khách
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="VD: Giao giờ trưa, Cho xem hàng trước, Gọi trước khi giao..."
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 transition-all resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex items-center justify-between gap-3">
            <button onClick={onClose} disabled={loading}
              className="px-5 py-2.5 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all">
              Hủy
            </button>
            <button onClick={handleSave} disabled={loading}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all shadow-lg",
                loading ? "bg-zinc-400 cursor-not-allowed" : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/30"
              )}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...</> : <><Save className="w-4 h-4" /> Lưu thay đổi</>}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// =============================================
// Main Page Component
// =============================================
export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [shippingFilter, setShippingFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("DESC");

  // Modals
  const [shippingModalOrder, setShippingModalOrder] = useState(null);
  const [editModalOrder, setEditModalOrder] = useState(null);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auth guard
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.push("/login");
  }, [router]);

  // Fetch orders
  const fetchOrders = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: pagination.limit });
      if (statusFilter) params.set("status", statusFilter);
      if (shippingFilter) params.set("shipping_provider", shippingFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("sort", sortBy);
      params.set("order", sortOrder);

      const res = await authFetch(`${API_BASE}/api/orders?${params}`);
      if (!res.ok) throw new Error("Failed to fetch orders");
      const result = await res.json();
      setOrders(result.data || []);
      setPagination(result.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      console.error("[Orders] Fetch error:", err);
      toast({ title: "Lỗi tải đơn hàng", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, shippingFilter, debouncedSearch, sortBy, sortOrder, pagination.limit]);

  useEffect(() => {
    fetchOrders(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, shippingFilter, debouncedSearch, sortBy, sortOrder]);


  // Update order status
  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      const res = await authFetch(`${API_BASE}/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "✅ Đã cập nhật trạng thái đơn hàng" });
      fetchOrders(pagination.page);
    } catch (err) {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    }
  };

  // Cancel shipping
  const handleCancelShipping = async (orderId) => {
    if (!confirm("Bạn chắc chắn muốn hủy giao hàng cho đơn này?")) return;
    try {
      const res = await authFetch(`${API_BASE}/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error("Failed to cancel");
      toast({ title: "❌ Đã hủy giao hàng đơn #" + orderId });
      fetchOrders(pagination.page);
    } catch (err) {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === "ASC" ? "DESC" : "ASC");
    } else {
      setSortBy(column);
      setSortOrder("DESC");
    }
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <ArrowUpDown className="w-3 h-3 text-zinc-400" />;
    return sortOrder === "ASC" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
  };

  // Summary stats
  const pendingCount = orders.filter(o => o.status === "pending").length;
  const shippingCount = orders.filter(o => o.status === "shipping").length;

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-zinc-50 to-white">

      {/* ════════════════ SHIPPING MODAL ════════════════ */}
      {shippingModalOrder && (
        <ShippingModal
          order={shippingModalOrder}
          onClose={() => setShippingModalOrder(null)}
          onSuccess={() => fetchOrders(pagination.page)}
        />
      )}

      {/* ════════════════ EDIT ORDER MODAL ════════════════ */}
      {editModalOrder && (
        <EditOrderModal
          order={editModalOrder}
          onClose={() => setEditModalOrder(null)}
          onSuccess={() => fetchOrders(pagination.page)}
        />
      )}

      {/* ════════════════ HEADER ════════════════ */}
      <div className="flex-shrink-0 border-b border-zinc-200/80 bg-white">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-zinc-900">Quản lý Đơn hàng</h1>
                <p className="text-xs text-zinc-500">
                  {pagination.total} đơn hàng
                  {pendingCount > 0 && <span className="ml-2 text-amber-600 font-semibold">• {pendingCount} chờ xử lý</span>}
                  {shippingCount > 0 && <span className="ml-2 text-indigo-600 font-semibold">• {shippingCount} đang giao</span>}
                </p>
              </div>
            </div>

            <button
              onClick={() => fetchOrders(pagination.page)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Làm mới
            </button>
          </div>

          {/* ──── Toolbar: Search + Filters ──── */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã đơn, tên khách, SĐT, mã vận đơn..."
                className="w-full pl-10 pr-10 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center transition-colors">
                  <X className="w-3 h-3 text-zinc-600" />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 text-[13px] font-medium bg-white border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer min-w-[150px]"
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>

            <select
              value={shippingFilter}
              onChange={(e) => setShippingFilter(e.target.value)}
              className="px-3 py-2.5 text-[13px] font-medium bg-white border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer min-w-[140px]"
            >
              <option value="">Tất cả ĐVVC</option>
              {Object.entries(SHIPPING_PROVIDERS).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ════════════════ TABLE ════════════════ */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-zinc-50/95 backdrop-blur-sm border-b border-zinc-200">
              <th className="text-left px-4 py-3">
                <button onClick={() => handleSort("id")} className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-700 transition-colors">
                  <Hash className="w-3 h-3" /> Mã đơn <SortIcon column="id" />
                </button>
              </th>
              <th className="text-left px-4 py-3">
                <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  <User className="w-3 h-3" /> Khách hàng
                </span>
              </th>
              <th className="text-left px-4 py-3">
                <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  <ShoppingBag className="w-3 h-3" /> Sản phẩm
                </span>
              </th>
              <th className="text-center px-3 py-3">
                <span className="flex items-center justify-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  SL
                </span>
              </th>
              <th className="text-left px-4 py-3">
                <button onClick={() => handleSort("total_amount")} className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-700 transition-colors">
                  <CreditCard className="w-3 h-3" /> Tổng tiền <SortIcon column="total_amount" />
                </button>
              </th>
              <th className="text-left px-4 py-3">
                <button onClick={() => handleSort("status")} className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-700 transition-colors">
                  Trạng thái <SortIcon column="status" />
                </button>
              </th>
              <th className="text-left px-4 py-3">
                <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  <Truck className="w-3 h-3" /> Vận chuyển
                </span>
              </th>
              <th className="text-left px-4 py-3">
                <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  <MapPin className="w-3 h-3" /> Địa chỉ
                </span>
              </th>
              <th className="text-left px-4 py-3">
                <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  <StickyNote className="w-3 h-3" /> Ghi chú
                </span>
              </th>
              <th className="text-left px-4 py-3">
                <button onClick={() => handleSort("created_at")} className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-700 transition-colors">
                  <Calendar className="w-3 h-3" /> Ngày tạo <SortIcon column="created_at" />
                </button>
              </th>
              <th className="text-center px-4 py-3">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Hành động
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 12 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-4 bg-zinc-100 rounded-lg w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center">
                      <Package className="w-8 h-8 text-zinc-400" />
                    </div>
                    <p className="text-sm font-medium text-zinc-500">
                      {debouncedSearch || statusFilter || shippingFilter ? "Không tìm thấy đơn hàng phù hợp" : "Chưa có đơn hàng nào"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const isAICreated = order.note?.includes("[AI Bot");
                const items = order.items || [];
                const itemsSummary = items.map(i => `${i.name} ×${i.quantity}`).join(", ");
                const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
                const canPush = (order.status === "pending" || order.status === "confirmed") && !order.tracking_code;
                const hasTracking = !!order.tracking_code;

                return (
                  <tr key={order.id} className="hover:bg-blue-50/30 transition-colors group">
                    {/* Mã đơn */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-900">#{order.id}</span>
                        {isAICreated && (
                          <span className="flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full">
                            <Bot className="w-2.5 h-2.5" /> AI
                          </span>
                        )}
                        {order.marketplace_source === "shopee" && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 bg-[#EE4D2D] text-white rounded-full">Shopee</span>
                        )}
                        {order.marketplace_source === "tiktok" && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 bg-zinc-900 text-white rounded-full">TikTok</span>
                        )}
                      </div>
                    </td>

                    {/* Khách hàng */}
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-zinc-800 truncate max-w-[140px]">{order.recipient_name || order.customer_name || "N/A"}</p>
                        {order.recipient_name && order.recipient_name !== order.customer_name && (
                          <p className="text-[9px] text-amber-500 truncate max-w-[140px]">FB: {order.customer_name}</p>
                        )}
                        {order.customer_phone && (
                          <p className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-emerald-500" /> {order.customer_phone}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Sản phẩm */}
                    <td className="px-4 py-3.5">
                      <p className="text-[12px] text-zinc-700 truncate max-w-[180px]" title={itemsSummary}>
                        {itemsSummary || "—"}
                      </p>
                    </td>

                    {/* Số lượng */}
                    <td className="px-3 py-3.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 text-[12px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg">
                        {totalQty}
                      </span>
                    </td>

                    {/* Tổng tiền */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-sm font-bold text-emerald-700">{formatCurrency(order.total_amount)}</span>
                        {order.shipping_fee > 0 && (
                          <span className="inline-flex items-center px-1 py-0.5 text-[8px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded">
                            +Ship
                          </span>
                        )}
                        {order.discount_amount > 0 && (
                          <span className="inline-flex items-center px-1 py-0.5 text-[8px] font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded">
                            -{formatCurrency(order.discount_amount)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="px-4 py-3.5">
                      <div className="relative group/status">
                        <StatusBadge status={order.status} />
                        <div className="absolute left-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-2xl p-1.5 z-20 opacity-0 invisible group-hover/status:opacity-100 group-hover/status:visible transition-all min-w-[140px]">
                          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                            <button
                              key={key}
                              onClick={() => handleUpdateStatus(order.id, key)}
                              disabled={key === order.status}
                              className={cn(
                                "w-full text-left px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1.5",
                                key === order.status
                                  ? "bg-zinc-50 text-zinc-400 cursor-not-allowed"
                                  : "hover:bg-zinc-50 text-zinc-700"
                              )}
                            >
                              <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                              {cfg.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Vận chuyển */}
                    <td className="px-4 py-3.5">
                      <TrackingCode code={order.tracking_code} provider={order.shipping_provider} />
                    </td>

                    {/* Địa chỉ */}
                    <td className="px-4 py-3.5">
                      <p className="text-[11px] text-zinc-600 truncate max-w-[160px] flex items-start gap-1" title={order.customer_address}>
                        {order.customer_address ? (
                          <><MapPin className="w-3 h-3 text-rose-400 flex-shrink-0 mt-0.5" />{order.customer_address}</>
                        ) : (
                          <span className="text-zinc-400 italic">Chưa có</span>
                        )}
                      </p>
                    </td>

                    {/* Ghi chú */}
                    <td className="px-4 py-3.5">
                      <p className="text-[11px] text-zinc-500 truncate max-w-[150px]" title={order.note}>
                        {order.note?.replace("[AI Bot tự động tạo] ", "🤖 ") || "—"}
                      </p>
                    </td>

                    {/* Ngày tạo */}
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-[12px] font-medium text-zinc-700">{formatDate(order.created_at)}</p>
                        <p className="text-[10px] text-zinc-400">{formatDateTime(order.created_at).split(", ")[1] || ""}</p>
                      </div>
                    </td>

                    {/* ★ HÀNH ĐỘNG ★ */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Edit button — always visible */}
                        <button
                          onClick={() => setEditModalOrder(order)}
                          className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all whitespace-nowrap"
                          title="Sửa đơn hàng"
                        >
                          <Pencil className="w-3 h-3" /> Sửa
                        </button>

                        {canPush ? (
                          <button
                            onClick={() => setShippingModalOrder(order)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-all whitespace-nowrap"
                          >
                            <Rocket className="w-3.5 h-3.5" /> Đẩy đơn
                          </button>
                        ) : hasTracking ? (
                          <>
                            <button
                              onClick={() => {
                                toast({ title: "🖨️ In vận đơn", description: `Mã: ${order.tracking_code}` });
                              }}
                              className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-lg transition-all whitespace-nowrap"
                            >
                              <Printer className="w-3 h-3" /> In
                            </button>
                            {order.status !== "cancelled" && order.status !== "completed" && (
                              <button
                                onClick={() => handleCancelShipping(order.id)}
                                className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all whitespace-nowrap"
                              >
                                <XCircle className="w-3 h-3" /> Hủy
                              </button>
                            )}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ════════════════ PAGINATION ════════════════ */}
      {pagination.totalPages > 1 && (
        <div className="flex-shrink-0 border-t border-zinc-200 bg-white px-6 py-3 flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Hiển thị <span className="font-bold text-zinc-700">{((pagination.page - 1) * pagination.limit) + 1}</span>
            –<span className="font-bold text-zinc-700">{Math.min(pagination.page * pagination.limit, pagination.total)}</span>
            {" "}trên <span className="font-bold text-zinc-700">{pagination.total}</span> đơn hàng
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchOrders(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Trước
            </button>

            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              let pageNum;
              if (pagination.totalPages <= 5) pageNum = i + 1;
              else if (pagination.page <= 3) pageNum = i + 1;
              else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
              else pageNum = pagination.page - 2 + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => fetchOrders(pageNum)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-[12px] font-bold transition-all",
                    pageNum === pagination.page
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                      : "text-zinc-600 hover:bg-zinc-100"
                  )}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => fetchOrders(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Tiếp <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
