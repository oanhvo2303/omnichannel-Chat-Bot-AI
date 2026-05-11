"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, Search, ShieldCheck, Ban, CheckCircle2, Clock, Zap,
  Calendar, Crown, ArrowUpDown, Loader2, AlertTriangle, MoreHorizontal,
  MessageSquare, ShoppingBag, ChevronDown, SlidersHorizontal, Pencil, KeyRound, RefreshCw
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const PLAN_COLORS = {
  FREE: "bg-zinc-700 text-zinc-300",
  BASIC: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PRO: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  ENTERPRISE: "bg-violet-500/20 text-violet-400 border-violet-500/30",
};
const STATUS_CONFIG = {
  ACTIVE: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, dot: "bg-emerald-400" },
  TRIAL: { color: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: Clock, dot: "bg-amber-400" },
  SUSPENDED: { color: "bg-red-500/10 text-red-400 border-red-500/30", icon: Ban, dot: "bg-red-500" },
  EXPIRED: { color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30", icon: AlertTriangle, dot: "bg-zinc-500" },
};

export default function ShopsManagementPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [actionShop, setActionShop] = useState(null);
  const [actionType, setActionType] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [extendDays, setExtendDays] = useState(30);
  const [quotaValue, setQuotaValue] = useState(1000);
  // Edit profile state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  // Reset password state
  const [newPass, setNewPass] = useState("");

  const authFetch = useCallback(async (url, opts = {}) => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); throw new Error("No token"); }
    const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers } });
    if (res.status === 401 || res.status === 403) { router.push("/login"); throw new Error("Auth failed"); }
    return res;
  }, [router]);

  const loadTenants = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/admin/tenants`);
      setTenants(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [authFetch]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  // ═══ ACTIONS ═══
  const handleSuspend = async (shopId) => {
    setActionLoading(true);
    try {
      const res = await authFetch(`${API}/api/admin/tenants/${shopId}/suspend`, { method: "PUT" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "🚫 Đã khóa Shop", description: data.message });
        setTenants(prev => prev.map(t => t.id === shopId ? { ...t, license_status: 'SUSPENDED', account_status: 'banned' } : t));
      } else toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
    } catch (e) { toast({ title: "❌ Lỗi", description: e.message, variant: "destructive" }); }
    finally { setActionLoading(false); setActionShop(null); }
  };

  const handleActivate = async (shopId) => {
    setActionLoading(true);
    try {
      const res = await authFetch(`${API}/api/admin/tenants/${shopId}/activate`, { method: "PUT" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "✅ Đã kích hoạt Shop", description: data.message });
        setTenants(prev => prev.map(t => t.id === shopId ? { ...t, license_status: 'ACTIVE', account_status: 'active' } : t));
      } else toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
    } catch (e) { toast({ title: "❌ Lỗi", description: e.message, variant: "destructive" }); }
    finally { setActionLoading(false); setActionShop(null); }
  };

  const handleExtend = async (shopId) => {
    setActionLoading(true);
    try {
      const res = await authFetch(`${API}/api/admin/tenants/${shopId}/extend`, {
        method: "PUT", body: JSON.stringify({ days: extendDays }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "📅 Gia hạn thành công", description: data.message });
        setTenants(prev => prev.map(t => t.id === shopId ? { ...t, license_status: 'ACTIVE', license_expires_at: data.new_expires_at } : t));
      } else toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
    } catch (e) { toast({ title: "❌ Lỗi", description: e.message, variant: "destructive" }); }
    finally { setActionLoading(false); setActionShop(null); }
  };

  const handleChangeQuota = async (shopId) => {
    setActionLoading(true);
    try {
      const res = await authFetch(`${API}/api/admin/tenants/${shopId}/quota`, {
        method: "PUT", body: JSON.stringify({ quota: Number(quotaValue) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "🤖 Đã cập nhật Quota", description: data.message });
        setTenants(prev => prev.map(t => t.id === shopId ? { ...t, ai_quota_limit: Number(quotaValue) } : t));
      } else toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
    } catch (e) { toast({ title: "❌ Lỗi", description: e.message, variant: "destructive" }); }
    finally { setActionLoading(false); setActionShop(null); setActionType(""); }
  };

  const handleChangePlan = async (shopId, plan) => {
    try {
      const res = await authFetch(`${API}/api/admin/tenants/${shopId}/plan`, {
        method: "PUT", body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "💎 Đã đổi gói", description: data.message });
        setTenants(prev => prev.map(t => t.id === shopId ? { ...t, subscription_plan: plan.toUpperCase() } : t));
      } else toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
    } catch (e) { toast({ title: "❌ Lỗi", description: e.message, variant: "destructive" }); }
  };

  const handleEditProfile = async (shopId) => {
    if (!editName.trim() && !editEmail.trim()) return toast({ title: "⚠️ Nhập ít nhất 1 trường", variant: "destructive" });
    setActionLoading(true);
    try {
      const res = await authFetch(`${API}/api/admin/tenants/${shopId}/profile`, {
        method: "PATCH", body: JSON.stringify({ shop_name: editName, email: editEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "✏️ Đã cập nhật", description: data.message });
        setTenants(prev => prev.map(t => t.id === shopId ? { ...t, shop_name: data.shop?.shop_name || t.shop_name, email: data.shop?.email || t.email } : t));
        setActionShop(null); setActionType("");
      } else toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
    } catch (e) { toast({ title: "❌ Lỗi", description: e.message, variant: "destructive" }); }
    finally { setActionLoading(false); }
  };

  const handleResetPassword = async (shopId) => {
    if (!newPass || newPass.length < 6) return toast({ title: "⚠️ Mật khẩu ít nhất 6 ký tự", variant: "destructive" });
    setActionLoading(true);
    try {
      const res = await authFetch(`${API}/api/admin/tenants/${shopId}/reset-password`, {
        method: "PATCH", body: JSON.stringify({ new_password: newPass }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "🔑 Đã đặt lại mật khẩu", description: data.message });
        setNewPass(""); setActionShop(null); setActionType("");
      } else toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
    } catch (e) { toast({ title: "❌ Lỗi", description: e.message, variant: "destructive" }); }
    finally { setActionLoading(false); }
  };

  const handleResetQuotaShop = async (shopId) => {
    setActionLoading(true);
    try {
      const res = await authFetch(`${API}/api/admin/tenants/${shopId}/reset-quota`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "🔄 Đã reset quota", description: data.message });
        setTenants(prev => prev.map(t => t.id === shopId ? { ...t, ai_messages_used: 0 } : t));
      } else toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
    } catch (e) { toast({ title: "❌ Lỗi", description: e.message, variant: "destructive" }); }
    finally { setActionLoading(false); setActionShop(null); setActionType(""); }
  };

  // ═══ FILTER ═══
  const filtered = tenants
    .filter(t => {
      if (filterStatus !== "ALL" && (t.license_status || 'ACTIVE') !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return (t.shop_name || "").toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || String(t.id).includes(q);
      }
      return true;
    });

  const fmt = (n) => (n || 0).toLocaleString("vi-VN");

  const formatDate = (d) => {
    if (!d) return "—";
    const date = new Date(d);
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const daysUntilExpiry = (d) => {
    if (!d) return null;
    const diff = Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-rose-400" /> Quản lý Khách hàng (Shops)
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Quản lý license, gói cước và quyền truy cập của tất cả Shop Owner.</p>
        </div>
        <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700">
          {tenants.length} tenants
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên, email hoặc ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-600 transition-colors" />
        </div>
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {["ALL", "ACTIVE", "TRIAL", "SUSPENDED", "EXPIRED"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn("px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all",
                filterStatus === s ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300")}>
              {s === "ALL" ? "Tất cả" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl overflow-hidden backdrop-blur-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500 mr-2" /> Đang tải...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-black/50 text-zinc-500 text-[10px] uppercase tracking-wider font-bold border-b border-white/[0.06]">
                <tr>
                  <th className="text-left px-6 py-3.5">Shop / Owner</th>
                  <th className="text-center px-4 py-3.5">Gói cước</th>
                  <th className="text-center px-4 py-3.5">License</th>
                  <th className="text-center px-4 py-3.5">Hết hạn</th>
                  <th className="text-right px-4 py-3.5">AI Usage</th>
                  <th className="text-right px-4 py-3.5">Hoạt động</th>
                  <th className="text-center px-6 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(t => {
                  const status = t.license_status || 'ACTIVE';
                  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ACTIVE;
                  const StatusIcon = cfg.icon;
                  const expiryDays = daysUntilExpiry(t.license_expires_at);
                  const aiPct = t.ai_quota_limit > 0 ? Math.round((t.ai_messages_used || 0) / t.ai_quota_limit * 100) : 0;

                  return (
                    <tr key={t.id} className="hover:bg-zinc-800/30 transition-colors group">
                      {/* Shop Info */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 border border-zinc-700 flex items-center justify-center font-black text-zinc-300 text-sm">
                            {t.shop_name ? t.shop_name[0].toUpperCase() : "S"}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-zinc-200 text-[13px]">{t.shop_name || "Chưa đặt tên"}</p>
                              {t.role === 'SUPER_ADMIN' && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">ADMIN</span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500">{t.email} • #{t.id}</p>
                          </div>
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-4 text-center">
                        <select value={(t.subscription_plan || 'FREE').toUpperCase()}
                          onChange={e => handleChangePlan(t.id, e.target.value)}
                          disabled={t.role === 'SUPER_ADMIN'}
                          className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border outline-none cursor-pointer transition-colors",
                            PLAN_COLORS[(t.subscription_plan || 'FREE').toUpperCase()] || PLAN_COLORS.FREE)}>
                          <option value="FREE">FREE</option>
                          <option value="BASIC">BASIC</option>
                          <option value="PRO">⭐ PRO</option>
                          <option value="ENTERPRISE">🏢 ENTERPRISE</option>
                        </select>
                      </td>

                      {/* License Status */}
                      <td className="px-4 py-4 text-center">
                        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border", cfg.color)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                          {status}
                        </span>
                      </td>

                      {/* Expiry Date */}
                      <td className="px-4 py-4 text-center">
                        {t.license_expires_at ? (
                          <div>
                            <p className="text-xs text-zinc-400 font-mono">{formatDate(t.license_expires_at)}</p>
                            {expiryDays !== null && (
                              <p className={cn("text-[10px] font-bold mt-0.5",
                                expiryDays < 0 ? "text-red-400" : expiryDays <= 7 ? "text-amber-400" : "text-zinc-500")}>
                                {expiryDays < 0 ? `Quá hạn ${Math.abs(expiryDays)} ngày` : `Còn ${expiryDays} ngày`}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-600">Vĩnh viễn</span>
                        )}
                      </td>

                      {/* AI Usage */}
                      <td className="px-4 py-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-mono text-zinc-400">
                            {fmt(t.ai_messages_used || 0)}<span className="text-zinc-600">/{fmt(t.ai_quota_limit || 0)}</span>
                          </span>
                          <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all",
                              aiPct > 90 ? "bg-red-500" : aiPct > 70 ? "bg-amber-500" : "bg-violet-500")}
                              style={{ width: `${Math.min(100, aiPct)}%` }} />
                          </div>
                        </div>
                      </td>

                      {/* Activity */}
                      <td className="px-4 py-4 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs text-zinc-400 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> {fmt(t.total_messages)}
                          </span>
                          <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <ShoppingBag className="w-3 h-3" /> {fmt(t.total_orders)} đơn
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap max-w-[220px]">
                          {/* Edit Profile */}
                          <button onClick={() => { setActionShop(t); setActionType("edit"); setEditName(t.shop_name || ""); setEditEmail(t.email || ""); }}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-zinc-800 text-amber-400 border border-zinc-700 hover:border-amber-500/30 hover:bg-amber-500/10 transition-all"
                            title="Sửa thông tin">
                            <Pencil className="w-3 h-3 inline mr-1" />Sửa
                          </button>

                          {/* Reset Password */}
                          <button onClick={() => { setActionShop(t); setActionType("reset-pass"); setNewPass(""); }}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-zinc-800 text-orange-400 border border-zinc-700 hover:border-orange-500/30 hover:bg-orange-500/10 transition-all"
                            title="Đặt lại mật khẩu">
                            <KeyRound className="w-3 h-3 inline mr-1" />MK
                          </button>

                          {/* Quota */}
                          <button onClick={() => { setActionShop(t); setActionType("quota"); setQuotaValue(t.ai_quota_limit || 1000); }}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-zinc-800 text-violet-400 border border-zinc-700 hover:border-violet-500/30 hover:bg-violet-500/10 transition-all"
                            title="Sửa AI Quota">
                            <SlidersHorizontal className="w-3 h-3 inline mr-1" />Quota
                          </button>

                          {/* Reset quota counter */}
                          <button onClick={() => { setActionShop(t); setActionType("reset-quota"); }}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-zinc-800 text-emerald-400 border border-zinc-700 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all"
                            title="Reset bộ đếm AI về 0">
                            <RefreshCw className="w-3 h-3 inline mr-1" />Reset
                          </button>

                          {t.role !== 'SUPER_ADMIN' && (
                            <>
                              <button onClick={() => { setActionShop(t); setActionType("extend"); setExtendDays(30); }}
                                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-zinc-800 text-blue-400 border border-zinc-700 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all"
                                title="Gia hạn">
                                <Calendar className="w-3 h-3 inline mr-1" />Gia hạn
                              </button>

                              {status === 'ACTIVE' || status === 'TRIAL' ? (
                                <button onClick={() => { setActionShop(t); setActionType("suspend"); }}
                                  className="px-2 py-1 text-[10px] font-bold rounded-lg bg-zinc-800 text-red-400 border border-zinc-700 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
                                  title="Khóa">
                                  <Ban className="w-3 h-3 inline mr-1" />Khóa
                                </button>
                              ) : (
                                <button onClick={() => handleActivate(t.id)}
                                  className="px-2 py-1 text-[10px] font-bold rounded-lg bg-zinc-800 text-emerald-400 border border-zinc-700 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all"
                                  title="Mở khóa">
                                  <CheckCircle2 className="w-3 h-3 inline mr-1" />Mở khóa
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-zinc-500 text-sm">Không tìm thấy shop nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ ACTION DIALOGS ═══ */}

      {/* Suspend Confirmation */}
      <Dialog open={actionType === "suspend" && !!actionShop} onOpenChange={() => { setActionShop(null); setActionType(""); }}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Ban className="w-5 h-5" /> Khóa tài khoản Shop?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Shop <strong className="text-white">&quot;{actionShop?.shop_name}&quot;</strong> ({actionShop?.email}) sẽ bị khóa hoàn toàn.
            </p>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-xs text-red-400 font-medium">⚠️ Hậu quả:</p>
              <ul className="text-xs text-red-400/80 mt-1 space-y-0.5 list-disc list-inside">
                <li>Không thể đăng nhập vào hệ thống</li>
                <li>AI chatbot ngừng hoạt động</li>
                <li>Không thể tạo đơn hàng mới</li>
              </ul>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => { setActionShop(null); setActionType(""); }}
                className="flex-1 py-2 text-xs font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">
                Hủy
              </button>
              <button onClick={() => handleSuspend(actionShop.id)} disabled={actionLoading}
                className="flex-1 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                {actionLoading ? "Đang xử lý..." : "Khóa ngay"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quota Edit Dialog */}
      <Dialog open={actionType === "quota" && !!actionShop} onOpenChange={() => { setActionShop(null); setActionType(""); }}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-400">
              <SlidersHorizontal className="w-5 h-5" /> Chỉnh AI Quota
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Shop: <strong className="text-white">&quot;{actionShop?.shop_name}&quot;</strong>
            </p>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium">Số tin nhắn AI / tháng</label>
              <input
                type="number" min={0} max={100000} value={quotaValue}
                onChange={e => setQuotaValue(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 outline-none focus:border-violet-500/50 transition-colors"
              />
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 2000, 10000].map(v => (
                  <button key={v} onClick={() => setQuotaValue(v)}
                    className={cn("py-1.5 text-[10px] font-bold rounded-lg border transition-all",
                      quotaValue === v ? "bg-violet-500/20 text-violet-400 border-violet-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600")}>
                    {v >= 1000 ? `${v/1000}K` : v}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setActionShop(null); setActionType(""); }}
                className="flex-1 py-2 text-xs font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Hủy</button>
              <button onClick={() => handleChangeQuota(actionShop.id)} disabled={actionLoading}
                className="flex-1 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <SlidersHorizontal className="w-3 h-3" />}
                {actionLoading ? "Đang lưu..." : "Lưu Quota"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Extend License Dialog */}
      <Dialog open={actionType === "extend" && !!actionShop} onOpenChange={() => { setActionShop(null); setActionType(""); }}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-400">
              <Calendar className="w-5 h-5" /> Gia hạn License
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Gia hạn cho <strong className="text-white">&quot;{actionShop?.shop_name}&quot;</strong>
            </p>
            {actionShop?.license_expires_at && (
              <p className="text-xs text-zinc-500">Hạn hiện tại: <span className="text-zinc-300 font-mono">{formatDate(actionShop.license_expires_at)}</span></p>
            )}
            <div className="grid grid-cols-4 gap-2">
              {[30, 90, 180, 365].map(d => (
                <button key={d} onClick={() => setExtendDays(d)}
                  className={cn("py-2 text-xs font-bold rounded-xl border transition-all",
                    extendDays === d ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600")}>
                  +{d === 365 ? "1 năm" : `${d} ngày`}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => { setActionShop(null); setActionType(""); }}
                className="flex-1 py-2 text-xs font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Hủy</button>
              <button onClick={() => handleExtend(actionShop.id)} disabled={actionLoading}
                className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
                {actionLoading ? "Đang xử lý..." : `Gia hạn +${extendDays} ngày`}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={actionType === "edit" && !!actionShop} onOpenChange={() => { setActionShop(null); setActionType(""); }}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Pencil className="w-5 h-5" /> Sửa thông tin Shop
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">Shop #{actionShop?.id}</p>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Tên Shop</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 outline-none focus:border-amber-500/50"
                placeholder="Tên shop" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Email đăng nhập</label>
              <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 outline-none focus:border-amber-500/50"
                placeholder="email@example.com" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setActionShop(null); setActionType(""); }}
                className="flex-1 py-2 text-xs font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Hủy</button>
              <button onClick={() => handleEditProfile(actionShop.id)} disabled={actionLoading}
                className="flex-1 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
                {actionLoading ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={actionType === "reset-pass" && !!actionShop} onOpenChange={() => { setActionShop(null); setActionType(""); setNewPass(""); }}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400">
              <KeyRound className="w-5 h-5" /> Đặt lại mật khẩu
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Shop: <strong className="text-white">&quot;{actionShop?.shop_name}&quot;</strong> ({actionShop?.email})
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Mật khẩu mới (ít nhất 6 ký tự)</label>
              <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 outline-none focus:border-orange-500/50"
                placeholder="Nhập mật khẩu mới..." />
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <p className="text-xs text-amber-400">⚠️ User sẽ cần đăng nhập lại bằng mật khẩu mới này.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setActionShop(null); setActionType(""); setNewPass(""); }}
                className="flex-1 py-2 text-xs font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Hủy</button>
              <button onClick={() => handleResetPassword(actionShop.id)} disabled={actionLoading}
                className="flex-1 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                {actionLoading ? "Đang xử lý..." : "Đặt lại ngay"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Quota Confirmation Dialog */}
      <Dialog open={actionType === "reset-quota" && !!actionShop} onOpenChange={() => { setActionShop(null); setActionType(""); }}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <RefreshCw className="w-5 h-5" /> Reset bộ đếm AI?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Đặt lại bộ đếm AI về <strong className="text-white">0</strong> cho shop <strong className="text-white">&quot;{actionShop?.shop_name}&quot;</strong>.
            </p>
            <p className="text-xs text-zinc-500">Dùng khi bắt đầu kỳ billing mới.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setActionShop(null); setActionType(""); }}
                className="flex-1 py-2 text-xs font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Hủy</button>
              <button onClick={() => handleResetQuotaShop(actionShop.id)} disabled={actionLoading}
                className="flex-1 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {actionLoading ? "Đang xử lý..." : "Reset về 0"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
