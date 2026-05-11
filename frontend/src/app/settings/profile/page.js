"use client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User, Lock, Save, Loader2, CheckCircle2, Eye, EyeOff, Shield, AlertTriangle
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const authFetch = async (url, opts = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);

  // Profile state
  const [shopName, setShopName] = useState("");
  const [email, setEmail]       = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [oldPass, setOldPass]   = useState("");
  const [newPass, setNewPass]   = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showOld, setShowOld]   = useState(false);
  const [showNew, setShowNew]   = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  // Account info display
  const [role, setRole]                 = useState("");
  const [plan, setPlan]                 = useState("");
  const [licenseStatus, setLicense]     = useState("");
  const [createdAt, setCreatedAt]       = useState("");

  useEffect(() => { fetchMe(); }, []);

  const fetchMe = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/auth/me`);
      if (res.ok) {
        const { shop } = await res.json();
        setShopName(shop.shop_name || "");
        setEmail(shop.email || "");
        setRole(shop.role || "SHOP_OWNER");
        setPlan(shop.subscription_plan || "FREE");
        setLicense(shop.license_status || "ACTIVE");
        setCreatedAt(shop.created_at ? new Date(shop.created_at).toLocaleDateString("vi-VN") : "");
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSaveProfile = async () => {
    if (!shopName.trim() && !email.trim()) {
      return toast({ title: "⚠️ Chưa nhập thông tin", variant: "destructive" });
    }
    setSavingProfile(true);
    try {
      const res = await authFetch(`${API_BASE}/api/auth/profile`, {
        method: "PATCH",
        body: JSON.stringify({ shop_name: shopName, email }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "✅ Đã cập nhật thông tin", description: data.message });
      } else {
        toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "❌ Lỗi kết nối", description: e.message, variant: "destructive" });
    } finally { setSavingProfile(false); }
  };

  const handleChangePassword = async () => {
    if (!oldPass || !newPass || !confirmPass) {
      return toast({ title: "⚠️ Vui lòng điền đủ các trường mật khẩu", variant: "destructive" });
    }
    if (newPass.length < 6) {
      return toast({ title: "⚠️ Mật khẩu mới phải ít nhất 6 ký tự", variant: "destructive" });
    }
    if (newPass !== confirmPass) {
      return toast({ title: "⚠️ Mật khẩu xác nhận không khớp", variant: "destructive" });
    }
    setSavingPass(true);
    try {
      const res = await authFetch(`${API_BASE}/api/auth/password`, {
        method: "PATCH",
        body: JSON.stringify({ old_password: oldPass, new_password: newPass }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "✅ Đổi mật khẩu thành công", description: "Vui lòng đăng nhập lại." });
        setOldPass(""); setNewPass(""); setConfirmPass("");
        // Auto logout sau 2 giây
        setTimeout(() => {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }, 2000);
      } else {
        toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "❌ Lỗi kết nối", description: e.message, variant: "destructive" });
    } finally { setSavingPass(false); }
  };

  const licenseColor = {
    ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    TRIAL: "bg-blue-50 text-blue-700 border-blue-200",
    SUSPENDED: "bg-red-50 text-red-600 border-red-200",
    EXPIRED: "bg-zinc-50 text-zinc-500 border-zinc-200",
  }[licenseStatus] || "bg-zinc-50 text-zinc-500 border-zinc-200";

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Tài khoản của tôi</h1>
            <p className="text-xs text-zinc-500">Cập nhật thông tin và mật khẩu đăng nhập</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-8 py-6 space-y-6">

          {/* Account summary */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center text-2xl font-bold text-violet-600 flex-shrink-0">
              {shopName.charAt(0)?.toUpperCase() || "S"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-zinc-900 truncate">{shopName}</p>
              <p className="text-xs text-zinc-500 truncate">{email}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full border border-violet-200">{role}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-50 text-zinc-600 rounded-full border border-zinc-200">{plan}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", licenseColor)}>{licenseStatus}</span>
                {createdAt && <span className="text-[10px] text-zinc-400">Từ {createdAt}</span>}
              </div>
            </div>
          </div>

          {/* Profile form */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
              <User className="w-4 h-4 text-violet-500" />
              <h2 className="text-sm font-bold text-zinc-800">Thông tin cơ bản</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Tên Shop</label>
                <input
                  id="profile-shop-name"
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="Tên shop của bạn"
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Email đăng nhập</label>
                <input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
                />
              </div>
              <button
                id="save-profile-btn"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all",
                  savingProfile
                    ? "bg-zinc-200 text-zinc-400 cursor-wait"
                    : "bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg"
                )}
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingProfile ? "Đang lưu..." : "Lưu thông tin"}
              </button>
            </div>
          </div>

          {/* Password change */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-zinc-800">Đổi mật khẩu</h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Old password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Mật khẩu hiện tại</label>
                <div className="relative">
                  <input
                    id="old-password"
                    type={showOld ? "text" : "password"}
                    value={oldPass}
                    onChange={(e) => setOldPass(e.target.value)}
                    placeholder="Nhập mật khẩu hiện tại"
                    className="w-full px-4 py-2.5 pr-10 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 transition-all"
                  />
                  <button onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                    {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Mật khẩu mới</label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNew ? "text" : "password"}
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Ít nhất 6 ký tự"
                    className="w-full px-4 py-2.5 pr-10 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 transition-all"
                  />
                  <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Strength indicator */}
                {newPass && (
                  <div className="flex gap-1 mt-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={cn("h-1 flex-1 rounded-full transition-all",
                        newPass.length >= i * 3
                          ? i <= 2 ? "bg-red-400" : i === 3 ? "bg-amber-400" : "bg-emerald-400"
                          : "bg-zinc-200"
                      )} />
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Xác nhận mật khẩu mới</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className={cn(
                    "w-full px-4 py-2.5 bg-zinc-50 border rounded-xl text-sm outline-none transition-all",
                    confirmPass && confirmPass !== newPass
                      ? "border-red-300 focus:ring-2 focus:ring-red-500/20"
                      : "border-zinc-200 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300"
                  )}
                />
                {confirmPass && confirmPass !== newPass && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Mật khẩu xác nhận không khớp
                  </p>
                )}
                {confirmPass && confirmPass === newPass && newPass.length >= 6 && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Mật khẩu khớp
                  </p>
                )}
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <Shield className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700">
                  Sau khi đổi mật khẩu, bạn sẽ được đăng xuất tự động và cần đăng nhập lại.
                </p>
              </div>

              <button
                id="change-password-btn"
                onClick={handleChangePassword}
                disabled={savingPass}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all",
                  savingPass
                    ? "bg-zinc-200 text-zinc-400 cursor-wait"
                    : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md hover:shadow-lg"
                )}
              >
                {savingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {savingPass ? "Đang xử lý..." : "Đổi mật khẩu"}
              </button>
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
