"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, Plus, Trash2, Edit3, Shield, ShieldCheck, ShieldAlert, Mail, Eye, UserCog
} from "lucide-react";

const roleConfig = {
  shop_owner: { label: "Chủ Shop", icon: ShieldAlert, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  super_admin: { label: "Super Admin", icon: ShieldCheck, cls: "bg-red-50 text-red-700 border-red-200" },
  staff: { label: "Nhân viên Sale", icon: Shield, cls: "bg-blue-50 text-blue-700 border-blue-200" },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function StaffSettingsPage() {
  const [staff, setStaff] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });
  const [shop, setShop] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Lấy dữ liệu khi load trang

  const router = useRouter();

  const authFetch = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return null; }
    const res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    if (res.status === 401) { router.push("/login"); return null; }
    return res;
  }, [router]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [shopRes, staffRes] = await Promise.all([
        authFetch(`${API_BASE}/api/auth/me`),
        authFetch(`${API_BASE}/api/staff`)
      ]);
      if (shopRes?.ok) {
         const data = await shopRes.json();
         // Cập nhật lấy settings auto assign
         setShop(data.shop);
      }
      if (staffRes?.ok) setStaff(await staffRes.json());
    } catch { }
    setIsLoading(false);
  }, [authFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleAutoAssign = async (val) => {
    try {
      const res = await authFetch(`${API_BASE}/api/shop/settings`, {
        method: "PATCH", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ auto_assign_staff: val })
      });
      if (res?.ok) {
        setShop(prev => ({ ...prev, auto_assign_staff: val ? 1 : 0 }));
        toast({ title: val ? "🚀 Bật chia hội thoại" : "⏸️ Đã tắt chia hội thoại" });
      }
    } catch { }
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return;
    try {
      const res = await authFetch(`${API_BASE}/api/staff/register`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify(form)
      });
      if (res?.ok) {
        toast({ title: "👥 Thêm nhân viên", description: form.name });
        loadData();
        setShowAddDialog(false);
        setForm({ name: "", email: "", password: "", role: "staff" });
      } else {
         const data = await res.json();
         toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
      }
    } catch { }
  };

  const handleDelete = (id) => {
    // Chưa hỗ trợ xoá ở DB, tạm làm mock UI
  };

  const handleToggleRole = (id, newRole) => {
    // Chưa API
  };

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Quản lý Nhân sự</h1>
              <p className="text-xs text-zinc-500">Tạo tài khoản, phân quyền cho nhân viên Sale</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {shop && (
              <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-4 py-2 rounded-xl">
                <span className="text-sm font-semibold text-zinc-700">Tự động chia khách</span>
                <button onClick={() => handleToggleAutoAssign(!shop.auto_assign_staff)}
                  className={cn("relative w-11 h-6 rounded-full transition-colors", 
                    shop.auto_assign_staff === 1 ? "bg-emerald-500" : "bg-zinc-300"
                  )}>
                  <div className={cn("absolute top-1 bg-white w-4 h-4 rounded-full transition-all shadow-sm", 
                    shop.auto_assign_staff === 1 ? "left-6" : "left-1"
                  )} />
                </button>
              </div>
            )}
            <button onClick={() => { setForm({ name: "", email: "", password: "", role: "staff" }); setShowAddDialog(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]">
              <Plus className="w-4 h-4" /> Thêm nhân viên
            </button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto px-8 py-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-zinc-900">{staff.length}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Tổng nhân viên</div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-emerald-600">{staff.filter((s) => s.is_online).length}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Đang online</div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-blue-600">{staff.reduce((sum, s) => sum + s.assigned_customers, 0)}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Khách được gán</div>
            </div>
          </div>

          {/* Staff Table */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left px-6 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Nhân viên</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Email</th>
                  <th className="text-center px-4 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Quyền</th>
                  <th className="text-center px-4 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Trạng thái</th>
                  <th className="text-center px-4 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Khách</th>
                  <th className="text-right px-6 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const role = roleConfig[member.role] || roleConfig.staff;
                  const RoleIcon = role.icon;
                  return (
                    <tr key={member.id} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs ring-2 ring-white shadow-sm">
                            {member.name.charAt(0)}
                          </div>
                          <span className="text-sm font-semibold text-zinc-800">{member.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-zinc-500 flex items-center gap-1"><Mail className="w-3 h-3" /> {member.email}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <select value={member.role} onChange={(e) => handleToggleRole(member.id, e.target.value)}
                          className={cn("text-[10px] font-bold px-3 py-1 rounded-full border cursor-pointer outline-none", role.cls)}>
                          <option value="staff">Nhân viên Sale</option>
                          <option value="super_admin">Super Admin</option>
                          <option value="shop_owner">Chủ Shop</option>
                        </select>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border",
                          member.is_online ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-500 border-zinc-200"
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", member.is_online ? "bg-emerald-500" : "bg-zinc-400")} />
                          {member.is_online ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm font-bold text-zinc-700">{member.assigned_customers}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleDelete(member.id)}
                          className="p-2 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </ScrollArea>

      {/* Add Staff Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-cyan-500" />
              Thêm nhân viên mới
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Họ và tên *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Mật khẩu *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Quyền</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer">
                <option value="staff">Nhân viên Sale</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <button onClick={handleAdd}
              className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-[0.98]">
              Tạo tài khoản
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
