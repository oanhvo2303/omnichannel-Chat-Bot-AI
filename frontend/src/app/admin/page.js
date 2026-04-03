"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ShieldCheck, Users, Zap, TrendingUp, Crown, AlertTriangle,
  DollarSign, MessageSquare, ShoppingBag, Activity
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const authFetch = useCallback(async (url, opts = {}) => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); throw new Error("No token"); }
    const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers } });
    if (res.status === 401 || res.status === 403) { router.push("/login"); throw new Error("Auth failed"); }
    return res;
  }, [router]);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API}/api/admin/metrics`);
        setMetrics(await res.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [authFetch]);

  const fmt = (n) => (n || 0).toLocaleString("vi-VN");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm font-medium">Loading platform metrics...</p>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Active Shops", value: metrics?.activeTenants || 0, icon: Users, color: "from-emerald-500 to-green-600", bgGlow: "shadow-emerald-500/20", subtext: `/ ${metrics?.totalTenants || 0} total` },
    { label: "Monthly Revenue", value: `${fmt(metrics?.mrr)}đ`, icon: DollarSign, color: "from-amber-500 to-orange-600", bgGlow: "shadow-amber-500/20", subtext: "MRR" },
    { label: "AI Messages", value: fmt(metrics?.totalAIMessages), icon: MessageSquare, color: "from-violet-500 to-purple-600", bgGlow: "shadow-violet-500/20", subtext: "all time" },
    { label: "Total Orders", value: fmt(metrics?.totalOrders), icon: ShoppingBag, color: "from-blue-500 to-indigo-600", bgGlow: "shadow-blue-500/20", subtext: `${fmt(metrics?.totalRevenue)}đ GMV` },
  ];

  const statuses = [
    { label: "Active", count: metrics?.activeTenants || 0, color: "bg-emerald-500", textColor: "text-emerald-400" },
    { label: "Trial", count: metrics?.trialTenants || 0, color: "bg-amber-500", textColor: "text-amber-400" },
    { label: "Suspended", count: metrics?.suspendedTenants || 0, color: "bg-red-500", textColor: "text-red-400" },
    { label: "Expired", count: metrics?.expiredTenants || 0, color: "bg-zinc-600", textColor: "text-zinc-400" },
  ];

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <Crown className="w-5 h-5 text-white" />
            </div>
            Platform Console
          </h1>
          <p className="text-zinc-500 text-sm mt-1 ml-[52px]">Tổng quan hiệu suất nền tảng SaaS Omnichannel</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span className="text-[11px] font-bold text-emerald-400">System Operational</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className={cn("relative overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900/50 backdrop-blur-sm p-6 group hover:border-white/10 transition-all", s.bgGlow)}>
              <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg", s.color)}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{s.label}</span>
              </div>
              <p className="text-2xl font-black text-white">{s.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{s.subtext}</p>
              {/* Decorative gradient */}
              <div className={cn("absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br opacity-[0.03] group-hover:opacity-[0.06] transition-opacity", s.color)} />
            </div>
          );
        })}
      </div>

      {/* License Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-6 backdrop-blur-sm">
          <h3 className="text-sm font-bold text-zinc-300 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-rose-400" /> License Status Distribution
          </h3>
          <div className="space-y-3">
            {statuses.map((s) => {
              const pct = metrics?.totalTenants > 0 ? Math.round((s.count / metrics.totalTenants) * 100) : 0;
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <span className={cn("text-xs font-bold w-20", s.textColor)}>{s.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-700", s.color)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-bold text-zinc-400 w-16 text-right">{s.count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-6 backdrop-blur-sm">
          <h3 className="text-sm font-bold text-zinc-300 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Quick Stats
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <p className="text-[10px] font-bold text-zinc-500 uppercase">New Today</p>
              <p className="text-xl font-black text-white mt-1">{metrics?.newTenantsToday || 0}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <p className="text-[10px] font-bold text-zinc-500 uppercase">Platform GMV</p>
              <p className="text-xl font-black text-emerald-400 mt-1">{fmt(metrics?.totalRevenue)}đ</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <p className="text-[10px] font-bold text-zinc-500 uppercase">Needs Attention</p>
              <p className="text-xl font-black text-amber-400 mt-1">{(metrics?.suspendedTenants || 0) + (metrics?.expiredTenants || 0)}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <p className="text-[10px] font-bold text-zinc-500 uppercase">AI Consumption</p>
              <p className="text-xl font-black text-violet-400 mt-1">{fmt(metrics?.totalAIMessages)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
