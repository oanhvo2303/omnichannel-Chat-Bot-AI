"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Link2, ExternalLink, CheckCircle2, XCircle, Plug, Unplug, ShieldCheck, Globe, Loader2, RefreshCw, Bot, Save, EyeOff
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const platforms = [
  {
    id: "facebook",
    name: "Facebook Messenger",
    description: "Nhận và trả lời tin nhắn từ Fanpage Facebook",
    logo: (
      <svg viewBox="0 0 36 36" className="w-8 h-8"><defs><linearGradient id="fb-grad" x1="50%" x2="50%" y1="97.078%" y2="0%"><stop offset="0%" stopColor="#0062E0"/><stop offset="100%" stopColor="#19AFFF"/></linearGradient></defs><path fill="url(#fb-grad)" d="M15 35.8C6.5 34.3 0 26.9 0 18 0 8.1 8.1 0 18 0s18 8.1 18 18c0 8.9-6.5 16.3-15 17.8l-1-.8h-4l-1 .8z"/><path fill="#fff" d="m25 23 .9-5H21v-3.5c0-1.4.5-2.5 2.7-2.5H26V7.4C24.9 7.3 23.5 7 21.7 7 17.8 7 15 9.5 15 13.7V18h-5v5h5v12.8c1 .2 2 .2 3 .2s2 0 3-.2V23h4z"/></svg>
    ),
    color: "from-blue-500 to-blue-600",
    btnColor: "bg-[#1877F2] hover:bg-[#166FE5]",
    btnText: "Đăng nhập với Facebook",
    oauthEndpoint: "/api/oauth/facebook",
  },
  {
    id: "zalo",
    name: "Zalo Official Account",
    description: "Kết nối Zalo OA để nhận và trả lời tin nhắn",
    logo: (
      <div className="w-8 h-8 bg-[#0068FF] rounded-lg flex items-center justify-center text-white font-black text-xs">Z</div>
    ),
    color: "from-blue-600 to-cyan-500",
    btnColor: "bg-[#0068FF] hover:bg-[#0058D9]",
    btnText: "Kết nối Zalo OA",
  },
  {
    id: "instagram",
    name: "Instagram Direct",
    description: "Nhận tin nhắn DM từ Instagram Business",
    logo: (
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
      </div>
    ),
    color: "from-[#F58529] to-[#DD2A7B]",
    btnColor: "bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90",
    btnText: "Kết nối Instagram",
  },
  {
    id: "shopee",
    name: "Shopee",
    description: "Đồng bộ đơn hàng & tin nhắn từ gian hàng Shopee",
    logo: (
      <div className="w-8 h-8 bg-[#EE4D2D] rounded-lg flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm.6 4.2c2.1 0 3.6 1.2 3.6 3.3 0 .6-.15 1.2-.45 1.8h-1.8c.3-.45.45-1.05.45-1.65 0-1.2-.75-1.95-1.8-1.95s-1.8.75-1.8 1.95c0 2.1 4.5 2.4 4.5 5.55 0 2.1-1.5 3.6-3.6 3.6-2.1 0-3.6-1.5-3.6-3.6 0-.6.15-1.2.45-1.8h1.8c-.3.45-.45 1.05-.45 1.65 0 1.2.75 2.1 1.8 2.1s1.8-.9 1.8-2.1c0-2.4-4.5-2.4-4.5-5.55 0-2.1 1.5-3.3 3.6-3.3z"/></svg>
      </div>
    ),
    color: "from-[#EE4D2D] to-[#FF6633]",
    btnColor: "bg-[#EE4D2D] hover:bg-[#D9441F]",
    btnText: "Kết nối Shopee",
  },
  {
    id: "tiktok",
    name: "TikTok Shop",
    description: "Đồng bộ đơn hàng & tin nhắn từ TikTok Shop",
    logo: (
      <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="white" className="w-4.5 h-4.5"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.1a8.16 8.16 0 004.76 1.56v-3.5c-.96 0-1.86-.18-2.7-.47h-.3z"/></svg>
      </div>
    ),
    color: "from-black to-zinc-800",
    btnColor: "bg-black hover:bg-zinc-800",
    btnText: "Kết nối TikTok",
  },
];

// Helper: gọi API có JWT token
const authFetch = async (url, options = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
  });
  return res;
};

export default function IntegrationsPage() {
  const [connections, setConnections] = useState({});
  const [loading, setLoading] = useState(false);
  const [disconnectDialog, setDisconnectDialog] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(null);

  // Tải danh sách kết nối từ Backend
  const fetchIntegrations = useCallback(async (retryCount = 0) => {
    setLoading(true);
    setConnecting(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        // Token chưa sẵn sàng (bfcache restore) → retry sau 1s
        if (retryCount < 3) {
          setTimeout(() => fetchIntegrations(retryCount + 1), 1000);
          return;
        }
      }
      const res = await authFetch(`${API_BASE}/api/integrations`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const map = {};
      (data.integrations || []).forEach((i) => {
        const basePlatform = i.platform.split('_')[0];
        const validPlatforms = ['facebook', 'zalo', 'instagram', 'shopee', 'tiktok'];
        if (!validPlatforms.includes(basePlatform)) return;
        if (!map[basePlatform]) map[basePlatform] = [];
        map[basePlatform].push({ 
          id: i.id,
          raw_platform: i.platform,
          connected: i.status === "connected", 
          page_name: i.page_name, 
          page_id: i.page_id, 
          status: i.status,
          connected_at: i.connected_at?.split("T")[0] || i.connected_at?.split(" ")[0],
          is_ai_active: !!i.is_ai_active,
          ai_system_prompt: i.ai_system_prompt || "",
          auto_hide_comments: i.auto_hide_comments || 'none',
        });
      });
      setConnections(map);

      // Nếu data trống nhưng thực tế có kết nối → retry 1 lần sau 1.5s
      if (Object.keys(map).length === 0 && retryCount < 2) {
        setTimeout(() => fetchIntegrations(retryCount + 1), 1500);
      }
    } catch (err) {
      console.error("Lỗi tải integrations:", err);
      // Retry khi lỗi network (Back từ redirect)
      if (retryCount < 2) {
        setTimeout(() => fetchIntegrations(retryCount + 1), 1500);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch khi component mount
  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // ★ Re-fetch khi user quay lại trang (Back, switch tab, alt-tab)
  useEffect(() => {
    const refetch = () => fetchIntegrations();
    const onPageShow = (e) => { if (e.persisted) refetch(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') refetch(); };

    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refetch);

    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refetch);
    };
  }, [fetchIntegrations]);

  // Kết nối Facebook: Gọi Backend lấy OAuth URL rồi redirect
  const handleConnectFacebook = async () => {
    setConnecting("facebook");
    try {
      const res = await authFetch(`${API_BASE}/api/oauth/facebook`);
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "❌ Lỗi", description: "Không lấy được URL đăng nhập Facebook.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi kết nối", description: err.message, variant: "destructive" });
    } finally {
      setConnecting(null);
    }
  };

  // Handler tổng cho nút kết nối
  const handleConnect = (platformId) => {
    if (platformId === "facebook") return handleConnectFacebook();
    toast({ title: "🔜 Sắp ra mắt", description: `Tích hợp ${platforms.find((p) => p.id === platformId)?.name} đang phát triển.` });
  };

  // Ngắt kết nối
  const handleDisconnect = async (platformId) => {
    setDisconnecting(true);
    try {
      const res = await authFetch(`${API_BASE}/api/integrations/${platformId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setConnections((prev) => { const next = { ...prev }; delete next[platformId]; return next; });
        toast({ title: "🔌 Đã ngắt kết nối", description: `${platforms.find((p) => p.id === platformId)?.name} đã bị gỡ bỏ.` });
      } else {
        toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally {
      setDisconnecting(false);
      setDisconnectDialog(null);
    }
  };

  const handleSaveConfig = async (platformId, connId) => {
    const connArr = connections[platformId] || [];
    const conn = connArr.find(c => c.id === connId);
    if (!conn?.id) return;
    try {
      const res = await authFetch(`${API_BASE}/api/integrations/${conn.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_ai_active: conn.is_ai_active, ai_system_prompt: conn.ai_system_prompt, auto_hide_comments: conn.auto_hide_comments })
      });
      if (res.ok) toast({ title: "✅ Đã lưu cấu hình", description: `Cập nhật thành công cho ${conn.page_name}` });
      else toast({ title: "❌ Lỗi", description: "Bị lỗi khi lưu cấu hình.", variant: "destructive" });
    } catch (err) {
      toast({ title: "❌ Lỗi kết nối", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleStatus = async (platformId, connId, currentStatus) => {
    const nextStatus = currentStatus === 'connected' ? 'disconnected' : 'connected';
    try {
      const res = await authFetch(`${API_BASE}/api/integrations/${connId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        toast({ title: "✅ Đã cập nhật trạng thái", description: `Đã ${nextStatus === 'connected' ? 'Bật' : 'Tắt'} nhận tin.` });
        setConnections(prev => {
          const arr = [...(prev[platformId] || [])];
          const idx = arr.findIndex(c => c.id === connId);
          if (idx !== -1) arr[idx].status = nextStatus;
          return { ...prev, [platformId]: arr };
        });
      } else {
        toast({ title: "❌ Lỗi", description: "Lỗi lưu trạng thái.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    }
  };

  const activeCount = Object.values(connections).flat().filter(c => c.status === 'connected').length;

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Link2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Kết nối Đa kênh</h1>
              <p className="text-xs text-zinc-500">Quản lý kênh bán hàng: Facebook, Zalo, Instagram, Shopee, TikTok</p>
            </div>
          </div>
          <button onClick={fetchIntegrations}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-500 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-all border border-zinc-200">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Làm mới
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto px-8 py-6">
          {/* Stats */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {activeCount} kênh hoạt động
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 text-zinc-500 border border-zinc-200 rounded-full text-xs font-semibold">
              <Globe className="w-3.5 h-3.5" />
              {platforms.length - Object.keys(connections).length} chưa kết nối
            </div>
            {loading && (
              <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đồng bộ...
              </div>
            )}
          </div>

          {/* ★ LUÔN RENDER GRID — không bao giờ block bởi loading */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {platforms.map((platform) => {
              const connList = connections[platform.id] || [];
              const isConnected = connList.length > 0;
              const isConnecting = connecting === platform.id;

              return (
                <div key={platform.id}
                  className={cn(
                    "bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-lg group",
                    isConnected ? "border-emerald-200 ring-1 ring-emerald-100" : "border-zinc-200 hover:border-zinc-300"
                  )}>
                  <div className={cn("h-1.5 bg-gradient-to-r", platform.color)} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {platform.logo}
                        <div>
                          <h3 className="text-sm font-bold text-zinc-900">{platform.name}</h3>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{platform.description}</p>
                        </div>
                      </div>
                      {isConnected && (
                        <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          <span className="font-mono">{connList.length}</span> Kênh
                        </span>
                      )}
                    </div>

                    {isConnected ? (
                      <div className="space-y-4">
                        {connList.map(conn => (
                          <div key={conn.id} className="space-y-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <img src={`https://graph.facebook.com/${conn.page_id}/picture?type=small`} alt={conn.page_name} className="w-6 h-6 rounded-full shadow-sm" crossOrigin="anonymous" onError={(e) => { e.target.style.display = 'none'; }} />
                                <div>
                                  <p className="text-xs font-bold text-zinc-700">{conn.page_name}</p>
                                  <p className="text-[9px] text-zinc-400">ID: {conn.page_id}</p>
                                </div>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer" title="Bật/tắt nhận tin nhắn">
                                <input type="checkbox" className="sr-only peer" checked={conn.status === 'connected'}
                                  onChange={() => handleToggleStatus(platform.id, conn.id, conn.status)} />
                                <div className="w-7 h-4 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                              </label>
                            </div>
                            
                            {/* Khối AI Auto Responder */}
                            <div className="bg-indigo-50/50 rounded-lg p-2 border border-indigo-100 flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700">
                                  <Bot className="w-3 h-3" /> Trợ lý AI
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" className="sr-only peer" checked={conn.is_ai_active}
                                    onChange={(e) => setConnections(p => {
                                      const arr = [...p[platform.id]];
                                      const idx = arr.findIndex(c => c.id === conn.id);
                                      arr[idx].is_ai_active = e.target.checked;
                                      return { ...p, [platform.id]: arr };
                                    })} />
                                  <div className="w-7 h-4 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                              </div>
                              {conn.is_ai_active && (
                                <div className="space-y-2 mt-1 animate-in fade-in slide-in-from-top-1">
                                  <textarea rows={2} value={conn.ai_system_prompt || ''}
                                    onChange={(e) => setConnections(p => {
                                      const arr = [...p[platform.id]];
                                      const idx = arr.findIndex(c => c.id === conn.id);
                                      arr[idx].ai_system_prompt = e.target.value;
                                      return { ...p, [platform.id]: arr };
                                    })}
                                    placeholder="Ví dụ: Bạn là nhân viên bán hàng..."
                                    className="w-full text-[10px] p-2 rounded-md border border-indigo-200 outline-none focus:ring-1 focus:ring-indigo-500/30 resize-none font-medium bg-white" />
                                </div>
                              )}
                              
                              {/* Khối Auto Hide Comments (Chỉ dành cho Facebook) */}
                              {platform.id === 'facebook' && (
                                <div className="bg-orange-50/50 rounded-lg p-2 border border-orange-100 mt-1 flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-orange-700">
                                      <EyeOff className="w-3 h-3" /> Tự động ẩn bình luận
                                    </div>
                                  </div>
                                  <select value={conn.auto_hide_comments || 'none'}
                                    onChange={(e) => setConnections(p => {
                                      const arr = [...p[platform.id]];
                                      const idx = arr.findIndex(c => c.id === conn.id);
                                      arr[idx].auto_hide_comments = e.target.value;
                                      return { ...p, [platform.id]: arr };
                                    })}
                                    className="w-full text-[10px] p-1.5 rounded-md border border-orange-200 outline-none focus:ring-1 focus:ring-orange-500/30 bg-white text-zinc-700 font-medium">
                                    <option value="none">Không tự động ẩn</option>
                                    <option value="all">Ẩn TẤT CẢ bình luận</option>
                                    <option value="phone">Chỉ ẩn bình luận CÓ SỐ ĐIỆN THOẠI</option>
                                  </select>
                                </div>
                              )}

                              <button onClick={() => handleSaveConfig(platform.id, conn.id)}
                                className="w-full py-1.5 mt-2 flex items-center justify-center gap-1.5 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-all">
                                <Save className="w-3 h-3" /> Lưu các cấu hình
                              </button>
                            </div>

                            <button onClick={() => setDisconnectDialog(conn.raw_platform)}
                              className="w-full py-1.5 flex items-center justify-center gap-1 text-[10px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-all">
                              <Unplug className="w-3 h-3" /> Xóa
                            </button>
                          </div>
                        ))}

                        <button onClick={() => handleConnect(platform.id)} disabled={isConnecting}
                          className="w-full py-2.5 flex items-center justify-center gap-2 text-zinc-700 bg-white hover:bg-zinc-50 border border-dashed border-zinc-300 text-xs font-bold rounded-xl transition-all shadow-sm">
                          {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                          {isConnecting ? "Đang kết nối..." : "+ Thêm kết nối mới"}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleConnect(platform.id)} disabled={isConnecting}
                        className={cn("w-full py-2.5 flex items-center justify-center gap-2 text-white text-xs font-bold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]", platform.btnColor,
                          isConnecting && "opacity-70 cursor-wait"
                        )}>
                        {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                        {isConnecting ? "Đang kết nối..." : platform.btnText}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info Banner */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ExternalLink className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-800">Hướng dẫn kết nối</p>
              <p className="text-[11px] text-blue-600 mt-1 leading-relaxed">
                Để kết nối Facebook Messenger, bạn cần quyền Admin trên Fanpage. Với Shopee/TikTok, bạn cần đăng nhập vào tài khoản seller. Token sẽ được tự động refresh mỗi 30 ngày.
              </p>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={!!disconnectDialog} onOpenChange={() => setDisconnectDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" /> Xác nhận ngắt kết nối
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600">
            Bạn có chắc muốn ngắt kết nối <strong>{platforms.find((p) => p.id === disconnectDialog)?.name}</strong>?
            Hệ thống sẽ ngừng nhận tin nhắn từ kênh này.
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setDisconnectDialog(null)}
              className="flex-1 py-2 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all">
              Hủy
            </button>
            <button onClick={() => handleDisconnect(disconnectDialog)} disabled={disconnecting}
              className="flex-1 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1">
              {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
              {disconnecting ? "Đang xóa..." : "Ngắt kết nối"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
