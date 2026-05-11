"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import io from "socket.io-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const STATUS_MAP = {
  draft: { text: "Bản nháp", cls: "bg-gray-100 text-gray-600", icon: "📝" },
  sending: { text: "Đang gửi...", cls: "bg-blue-100 text-blue-700 animate-pulse", icon: "🚀" },
  completed: { text: "Hoàn tất", cls: "bg-green-100 text-green-700", icon: "✅" },
  failed: { text: "Thất bại", cls: "bg-red-100 text-red-700", icon: "❌" },
};

export default function BroadcastPage() {
  const router = useRouter();
  const [shop, setShop] = useState(null);
  const [broadcasts, setBroadcasts] = useState([]);
  const [tags, setTags] = useState([]);

  // Form state
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [creating, setCreating] = useState(false);

  // Detail modal
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const shopData = localStorage.getItem("shop");
    if (!token || !shopData) { router.push("/login"); return; }
    try { setShop(JSON.parse(shopData)); } catch { router.push("/login"); }
  }, [router]);

  const authFetch = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return null; }
    const res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    if (res.status === 401) { router.push("/login"); return null; }
    return res;
  }, [router]);

  const loadData = useCallback(async () => {
    if (!shop) return;
    const [bRes, tRes] = await Promise.all([
      authFetch(`${API_BASE}/api/broadcasts`),
      authFetch(`${API_BASE}/api/tags`),
    ]);
    if (bRes?.ok) setBroadcasts(await bRes.json());
    if (tRes?.ok) setTags(await tRes.json());
  }, [shop, authFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  // Socket.IO: listen for broadcast progress
  useEffect(() => {
    if (!shop) return;
    const token = localStorage.getItem("token");
    if (!token) return; // Không kết nối nếu chưa auth

    // FIX: Gửi JWT token khi kết nối — backend verify và join đúng room theo shopId
    const socket = io(API_BASE, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect_error", (err) => {
      console.error("[SOCKET] Broadcast connection error:", err.message);
    });

    socket.on("broadcast_progress", (data) => {
      setBroadcasts((prev) =>
        prev.map((b) => b.id === data.id ? { ...b, ...data } : b)
      );
    });

    return () => socket.disconnect();
  }, [shop]);

  const handleCreate = async () => {
    if (!name.trim() || !message.trim()) return;
    setCreating(true);
    const res = await authFetch(`${API_BASE}/api/broadcasts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, message, image_url: imageUrl || null, tag_ids: selectedTags.length > 0 ? selectedTags : null }),
    });
    if (res?.ok) {
      setName(""); setMessage(""); setImageUrl(""); setSelectedTags([]);
      loadData();
    }
    setCreating(false);
  };

  const handleSend = async (id) => {
    if (!confirm("Bạn chắc chắn muốn bắt đầu gửi chiến dịch này?")) return;
    await authFetch(`${API_BASE}/api/broadcasts/${id}/send`, { method: "POST" });
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Xóa chiến dịch này?")) return;
    await authFetch(`${API_BASE}/api/broadcasts/${id}`, { method: "DELETE" });
    loadData();
  };

  const handleViewDetail = async (id) => {
    const res = await authFetch(`${API_BASE}/api/broadcasts/${id}`);
    if (res?.ok) setDetail(await res.json());
  };

  const toggleTag = (tagId) => {
    setSelectedTags((prev) => prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]);
  };

  if (!shop) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse text-gray-400">Đang xác thực...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")} className="text-gray-400 hover:text-gray-600 transition-colors">← Quay lại</button>
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">📣</span>
            </div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Broadcast</h1>
          </div>
          <span className="text-xs text-gray-400">{shop.shop_name || shop.email}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Create Form */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-700 mb-4">📝 Tạo chiến dịch mới</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Tên chiến dịch *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Sale cuối tuần 50%"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">URL Hình ảnh (tùy chọn)</label>
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 outline-none" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 block mb-1">Nội dung tin nhắn *</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
              placeholder="Xin chào! Shop đang có chương trình sale 50% ..." 
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 outline-none resize-none" />
          </div>

          {/* Tag Filter */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 block mb-2">🏷️ Lọc theo Tags (bỏ trống = gửi tất cả)</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button key={tag.id} onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all border-2 ${
                    selectedTags.includes(tag.id)
                      ? "text-white border-transparent shadow-md scale-105"
                      : "text-gray-500 border-gray-200 bg-white hover:border-gray-300"
                  }`}
                  style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : {}}>
                  {tag.name}
                </button>
              ))}
              {tags.length === 0 && <span className="text-xs text-gray-400">Chưa có tag nào</span>}
            </div>
          </div>

          <button onClick={handleCreate} disabled={creating || !name.trim() || !message.trim()}
            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-bold rounded-xl transition-all shadow-md disabled:opacity-50 active:scale-[0.98]">
            {creating ? "Đang tạo..." : "📣 Tạo chiến dịch"}
          </button>
        </div>

        {/* Campaigns List */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-700 mb-4">📋 Danh sách chiến dịch ({broadcasts.length})</h3>

          {broadcasts.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Chưa có chiến dịch nào</div>
          ) : (
            <div className="space-y-3">
              {broadcasts.map((b) => {
                const s = STATUS_MAP[b.status] || STATUS_MAP.draft;
                const progress = b.total > 0 ? ((b.sent + b.failed) / b.total * 100).toFixed(0) : 0;
                return (
                  <div key={b.id} className="border border-gray-100 rounded-xl p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-sm font-bold text-gray-800">{s.icon} {b.name}</h4>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{b.message}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${s.cls}`}>{s.text}</span>
                    </div>

                    {/* Progress bar for sending */}
                    {b.status === "sending" && (
                      <div className="mb-2">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }} />
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                          <span>✅ {b.sent} gửi | ❌ {b.failed} lỗi</span>
                          <span>{progress}% / {b.total} người</span>
                        </div>
                      </div>
                    )}

                    {/* Stats for completed */}
                    {b.status === "completed" && (
                      <div className="flex gap-3 mb-2 text-[10px]">
                        <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold">✅ {b.sent} gửi</span>
                        <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-bold">❌ {b.failed} lỗi</span>
                        <span className="bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full font-bold">👥 {b.total} tổng</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">
                        {new Date(b.created_at).toLocaleString("vi-VN")}
                        {b.tag_ids && <span className="ml-2">🏷️ {JSON.parse(b.tag_ids).length} tags</span>}
                      </span>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleViewDetail(b.id)}
                          className="text-[10px] px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 font-medium transition-all">
                          👁️ Chi tiết
                        </button>
                        {b.status === "draft" && (
                          <button onClick={() => handleSend(b.id)}
                            className="text-[10px] px-2.5 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full hover:from-purple-600 hover:to-pink-600 font-bold transition-all shadow-sm">
                            🚀 Gửi ngay
                          </button>
                        )}
                        <button onClick={() => handleDelete(b.id)}
                          className="text-[10px] px-2.5 py-1 bg-red-50 text-red-500 rounded-full hover:bg-red-100 font-medium transition-all">
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold">📋 {detail.name}</h3>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-700 whitespace-pre-wrap">{detail.message}</div>
            <div className="flex gap-2 mb-4 text-[10px]">
              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold">✅ {detail.sent}</span>
              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-bold">❌ {detail.failed}</span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">👥 {detail.total}</span>
            </div>
            {detail.logs?.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Chi tiết gửi</h4>
                {detail.logs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-[11px] py-1 border-b border-gray-50">
                    <span className="font-medium text-gray-700">{log.customer_name || log.platform_id}</span>
                    <span className={`font-bold ${log.status === "sent" ? "text-green-600" : log.status === "failed" ? "text-red-500" : "text-gray-400"}`}>
                      {log.status === "sent" ? "✅" : log.status === "failed" ? "❌" : "⏳"} {log.error || ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
