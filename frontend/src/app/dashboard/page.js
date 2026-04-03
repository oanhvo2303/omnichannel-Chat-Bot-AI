"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

export default function DashboardPage() {
  const router = useRouter();
  const [shop, setShop] = useState(null);
  const [summary, setSummary] = useState(null);
  const [performance, setPerformance] = useState([]);
  const [days, setDays] = useState(7); // default 7 days 
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const shopData = localStorage.getItem("shop");
    if (!token || !shopData) { router.push("/login"); return; }
    try { setShop(JSON.parse(shopData)); } catch { router.push("/login"); }
  }, [router]);

  const authFetch = useCallback(async (url) => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return null; }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { router.push("/login"); return null; }
    return res;
  }, [router]);

  const loadData = useCallback(async () => {
    if (!shop) return;
    setIsLoading(true);
    
    // Calculate dates
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    // Format to YYYY-MM-DD
    const fStart = startDate.toISOString().split('T')[0];
    const fEnd = endDate.toISOString().split('T')[0];

    try {
      const [sumRes, perfRes] = await Promise.all([
        authFetch(`${API_BASE}/api/analytics/summary?startDate=${fStart}&endDate=${fEnd}`),
        authFetch(`${API_BASE}/api/analytics/performance?startDate=${fStart}&endDate=${fEnd}`),
      ]);
      if (sumRes?.ok) setSummary(await sumRes.json());
      if (perfRes?.ok) setPerformance(await perfRes.json());
    } catch (err) {
      console.warn("[DASHBOARD] Lỗi tải dữ liệu", err.message);
    } finally {
      setIsLoading(false);
    }
  }, [shop, days, authFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  const fmt = (n) => (n || 0).toLocaleString("vi-VN");
  const fmtDate = (d) => { const p = d?.split("-"); return p ? `${p[2]}/${p[1]}` : d; };

  if (!shop) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse text-gray-400">Đang xác thực...</div></div>;

  // Prepare Pie Chart data (AI vs Sale)
  let pieDataOrders = [];
  let pieDataRevenue = [];
  if (performance.length > 0) {
    const totalAiOrders = performance.reduce((sum, item) => sum + (item.ai_orders || 0), 0);
    const totalStaffOrders = performance.reduce((sum, item) => sum + (item.staff_orders || 0), 0);
    
    if (totalAiOrders > 0 || totalStaffOrders > 0) {
      pieDataOrders = [
        { name: "AI chốt", value: totalAiOrders },
        { name: "Sale chốt", value: totalStaffOrders }
      ];
    }

    const totalAiRev = performance.reduce((sum, item) => sum + (item.ai_revenue || 0), 0);
    const totalStaffRev = performance.reduce((sum, item) => sum + (item.staff_revenue || 0), 0);

    if (totalAiRev > 0 || totalStaffRev > 0) {
      pieDataRevenue = [
        { name: "AI mang lại", value: totalAiRev },
        { name: "Sale mang lại", value: totalStaffRev }
      ];
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")} className="text-zinc-500 hover:text-black transition-colors" title="Về Chat">
              ← CRM Chat
            </button>
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">💡</span>
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-black">
                Báo Cáo Hiệu Suất
              </h1>
              <p className="text-xs text-zinc-500">{shop.shop_name || shop.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-zinc-100 p-1 rounded-lg border border-zinc-200">
            {[
              { label: "Hôm nay", value: 0 },
              { label: "7 ngày qua", value: 7 },
              { label: "30 ngày qua", value: 30 }
            ].map((d) => (
              <button key={d.value} onClick={() => setDays(d.value)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all shadow-sm ${days === d.value ? "bg-white text-black ring-1 ring-zinc-200" : "text-zinc-500 hover:bg-zinc-200"}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Tổng Doanh Thu", value: `${fmt(summary?.totalRevenue)} ₫`, icon: "💰", trend: "+12.5%", trendUp: true },
            { label: "Đơn Hàng Giao Dịch", value: fmt(summary?.totalOrders), icon: "📦", trend: "+5.2%", trendUp: true },
            { label: "Khách Hàng Mới", value: fmt(summary?.newCustomers), icon: "👤", trend: "+8.1%", trendUp: true },
            { label: "Tỷ Lệ Chốt Đơn (CVR)", value: `${summary?.conversionRate || 0}%`, icon: "⚡", trend: "-1.2%", trendUp: false },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-zinc-200 flex flex-col relative overflow-hidden group">
              <div className="flex items-center justify-between mb-4 relative z-10">
                <span className="text-sm font-semibold text-zinc-500">{kpi.label}</span>
                <span className="text-2xl">{kpi.icon}</span>
              </div>
              <p className="text-3xl font-extrabold text-black tracking-tight relative z-10">{isLoading ? "..." : kpi.value}</p>
              
              <div className="mt-4 flex items-center gap-1.5 relative z-10">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${kpi.trendUp ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {kpi.trend}
                </span>
                <span className="text-xs text-zinc-400">so với kỳ trước</span>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Composed Chart */}
          <div className="bg-white col-span-1 lg:col-span-2 rounded-xl p-6 shadow-sm border border-zinc-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-black">Diễn Biến Tăng Trưởng</h3>
                <p className="text-xs text-zinc-400">So sánh Số lượng và Doanh thu theo thời gian</p>
              </div>
            </div>
            
            {isLoading ? (
               <div className="h-[300px] flex items-center justify-center text-zinc-400">Đang tải biểu đồ...</div>
            ) : performance.length === 0 ? (
               <div className="h-[300px] flex items-center justify-center text-zinc-400">Không có dữ liệu</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={performance}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E4E7" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 12, fill: "#71717A" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#71717A" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#71717A" }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelFormatter={(v) => `Ngày: ${v}`} 
                    formatter={(v, name) => [name === "revenue" ? `${fmt(v)} ₫` : v, name === "orders" ? "Đơn Hàng" : "Doanh Thu"]} 
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  <Bar yAxisId="left" name="orders" dataKey="orders" fill="#18181B" radius={[4, 4, 0, 0]} barSize={24} />
                  <Line yAxisId="right" name="revenue" type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* AI vs Sale Performance */}
          <div className="bg-white col-span-1 border border-zinc-200 rounded-xl p-6 shadow-sm flex flex-col">
             <div className="mb-6">
              <h3 className="text-lg font-bold text-black">Trọng Số Chốt Đơn</h3>
              <p className="text-xs text-zinc-400">AI Trợ Lý vs Nhân Viên Thật (Attribution)</p>
            </div>

            <div className="flex-1 flex flex-col justify-center gap-8">
              {isLoading ? (
                <div className="h-[200px] flex items-center justify-center text-zinc-400">Đang phân tích...</div>
              ) : pieDataRevenue.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-zinc-400 bg-zinc-50 rounded-lg border border-dashed border-zinc-200">Chưa có giao dịch</div>
              ) : (
                <>
                  <div className="h-[220px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={pieDataRevenue} 
                          cx="50%" cy="50%" 
                          innerRadius={60} outerRadius={80} 
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieDataRevenue.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? "#10B981" : "#A1A1AA"} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(v) => `${fmt(v)} ₫`} 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Centered Total */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xs text-zinc-400">AI Mang Lại</span>
                      <span className="text-xl font-bold tracking-tight text-emerald-600">
                        {((pieDataRevenue[0]?.value || 0) / ((pieDataRevenue[0]?.value || 0) + (pieDataRevenue[1]?.value || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Legends */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                       <div className="flex items-center gap-2">
                         <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                         <span className="text-sm font-semibold text-emerald-900">🤖 Trợ Lý AI</span>
                       </div>
                       <span className="text-sm font-bold text-emerald-700">{fmt(pieDataRevenue[0]?.value || 0)} ₫</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                       <div className="flex items-center gap-2">
                         <div className="w-3 h-3 rounded-full bg-zinc-400"></div>
                         <span className="text-sm font-semibold text-zinc-700">👤 Nhân Viên</span>
                       </div>
                       <span className="text-sm font-bold text-zinc-900">{fmt(pieDataRevenue[1]?.value || 0)} ₫</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
