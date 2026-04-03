"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
const STATUS_LABELS = { pending: "Chờ xử lý", confirmed: "Đã xác nhận", shipping: "Đang giao", completed: "Hoàn tất", cancelled: "Đã hủy" };

export default function AnalyticsPage() {
  const router = useRouter();
  const [shop, setShop] = useState(null);
  const [overview, setOverview] = useState(null);
  const [messagesByDay, setMessagesByDay] = useState([]);
  const [ordersByDay, setOrdersByDay] = useState([]);
  const [orderStatus, setOrderStatus] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [days, setDays] = useState(14);

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
    try {
      const [ov, msg, ord, st, tp] = await Promise.all([
        authFetch(`${API_BASE}/api/analytics/overview`),
        authFetch(`${API_BASE}/api/analytics/messages-by-day?days=${days}`),
        authFetch(`${API_BASE}/api/analytics/orders-by-day?days=${days}`),
        authFetch(`${API_BASE}/api/analytics/order-status`),
        authFetch(`${API_BASE}/api/analytics/top-products`),
      ]);
      if (ov?.ok) setOverview(await ov.json());
      if (msg?.ok) setMessagesByDay(await msg.json());
      if (ord?.ok) setOrdersByDay(await ord.json());
      if (st?.ok) setOrderStatus(await st.json());
      if (tp?.ok) setTopProducts(await tp.json());
    } catch (err) { console.warn("[ANALYTICS]", err.message); }
  }, [shop, days, authFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  const fmt = (n) => (n || 0).toLocaleString("vi-VN");
  const fmtDate = (d) => { const parts = d?.split("-"); return parts ? `${parts[2]}/${parts[1]}` : d; };

  if (!shop) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse text-gray-400">Đang xác thực...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")} className="text-gray-400 hover:text-gray-600 transition-colors" title="Về Dashboard">
              ← Quay lại
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">📊</span>
            </div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Analytics
            </h1>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{shop.shop_name || shop.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Khoảng thời gian:</span>
            {[7, 14, 30].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${days === d ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {d} ngày
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Tin nhắn hôm nay", value: fmt(overview?.todayMessages), sub: `Tuần: ${fmt(overview?.weekMessages)}`, icon: "💬", color: "from-blue-500 to-blue-600" },
            { label: "Đơn hàng chốt", value: fmt(overview?.totalOrders), sub: `Hôm nay: ${fmt(overview?.todayOrders)}`, icon: "📦", color: "from-emerald-500 to-emerald-600" },
            { label: "Tổng doanh thu", value: `${fmt(overview?.totalRevenue)}đ`, sub: `Hôm nay: ${fmt(overview?.todayRevenue)}đ`, icon: "💰", color: "from-amber-500 to-amber-600" },
            { label: "Tỷ lệ chốt đơn", value: `${overview?.conversionRate || 0}%`, sub: `${fmt(overview?.totalOrders)}/${fmt(overview?.totalCustomers)} khách`, icon: "🎯", color: "from-purple-500 to-purple-600" },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{kpi.label}</span>
                <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center text-white text-lg shadow-sm`}>{kpi.icon}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
              <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Charts Row 1: Messages + Orders */}
        <div className="grid grid-cols-2 gap-4">
          {/* Messages Chart */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-4">💬 Tin nhắn theo ngày</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={messagesByDay}>
                <defs>
                  <linearGradient id="msgCustomer" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="msgBot" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                <Tooltip labelFormatter={(v) => `Ngày: ${v}`} formatter={(v, name) => [v, name === "from_customer" ? "Khách" : "Bot"]} />
                <Legend formatter={(v) => v === "from_customer" ? "Từ khách" : "Từ bot"} />
                <Area type="monotone" dataKey="from_customer" stroke="#3B82F6" fill="url(#msgCustomer)" strokeWidth={2} />
                <Area type="monotone" dataKey="from_bot" stroke="#10B981" fill="url(#msgBot)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Orders/Revenue Chart */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-4">📦 Đơn hàng & Doanh thu theo ngày</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ordersByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                <Tooltip labelFormatter={(v) => `Ngày: ${v}`} formatter={(v, name) => [name === "revenue" ? `${fmt(v)}đ` : v, name === "orders" ? "Đơn" : "Doanh thu"]} />
                <Legend formatter={(v) => v === "orders" ? "Số đơn" : "Doanh thu (đ)"} />
                <Bar yAxisId="left" dataKey="orders" fill="#8B5CF6" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar yAxisId="right" dataKey="revenue" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2: Pie + Top Products */}
        <div className="grid grid-cols-2 gap-4">
          {/* Order Status Pie */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-4">🎯 Phân bổ trạng thái đơn</h3>
            {orderStatus.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">Chưa có đơn hàng</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={orderStatus.map((s) => ({ ...s, name: STATUS_LABELS[s.status] || s.status }))}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={95} dataKey="count" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false} paddingAngle={3}>
                    {orderStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-4">🏆 Top sản phẩm bán chạy</h3>
            {topProducts.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu</div>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p, i) => {
                  const maxSold = topProducts[0]?.total_sold || 1;
                  return (
                    <div key={i}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                          <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                          {p.name}
                        </span>
                        <div className="text-right">
                          <span className="text-xs font-bold text-gray-900">{p.total_sold} SP</span>
                          <span className="text-[10px] text-gray-400 ml-2">{fmt(p.total_revenue)}đ</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(p.total_sold / maxSold) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
