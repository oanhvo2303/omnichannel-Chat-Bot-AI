"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Send, Users, Tag, ImagePlus, Eye, Sparkles, Clock, CheckCircle2,
  XCircle, Loader2, Rocket, History, AlertTriangle, TrendingUp, Zap
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const authFetch = async (url, opts = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers } });
};

// Mẫu tin nhắn gợi ý
const TEMPLATES = [
  { label: "Flash Sale", text: "🔥 {{name}} ơi! Shop đang giảm 50% hôm nay. Inbox ngay để chốt deal nhé!" },
  { label: "Chào khách cũ", text: "Xin chào {{name}}! 👋 Lâu quá không gặp bạn. Shop có sản phẩm mới cực xịn, ghé xem nhé!" },
  { label: "Nhắc thanh toán", text: "{{name}} ơi, đơn hàng của bạn đang chờ thanh toán. Inbox Shop để hoàn tất nhé 💳" },
  { label: "Voucher VIP", text: "🎁 Chúc mừng {{name}}! Bạn được tặng mã giảm 100K cho đơn tiếp theo: VIP100. Inbox để dùng ngay!" },
];

export default function RemarketingPage() {
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [filterMode, setFilterMode] = useState("all");

  const [previewCount, setPreviewCount] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null); // { total, sent, failed, current, percent, status }

  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);

  const textareaRef = useRef(null);

  // Load tags
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/tags`);
        const data = await res.json();
        setAllTags(data || []);
      } catch { /* */ }
    })();
  }, []);

  // Preview count khi thay đổi bộ lọc
  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const tagParam = filterMode === "tags" && selectedTags.length > 0 ? `?tags=${selectedTags.join(",")}` : "";
      const res = await authFetch(`${API_BASE}/api/remarketing/preview${tagParam}`);
      const data = await res.json();
      setPreviewCount(data.total);
    } catch { setPreviewCount(0); }
    finally { setLoadingPreview(false); }
  }, [filterMode, selectedTags]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  // Insert {{name}} biến
  const insertVariable = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newText = message.substring(0, start) + "{{name}}" + message.substring(end);
    setMessage(newText);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + 8, start + 8); }, 0);
  };

  // Toggle tag
  const toggleTag = (tagId) => {
    setSelectedTags((prev) => prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]);
  };

  // Gửi tin
  const handleSend = async () => {
    setConfirmDialog(false);
    setSending(true);
    setProgress({ total: previewCount, sent: 0, failed: 0, current: 0, percent: 0 });
    try {
      const res = await authFetch(`${API_BASE}/api/remarketing/send`, {
        method: "POST",
        body: JSON.stringify({
          message,
          image_url: imageUrl || undefined,
          tag_ids: filterMode === "tags" ? selectedTags : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
        setSending(false);
        setProgress(null);
        return;
      }
      toast({ title: "🚀 Đang gửi...", description: `${data.total} tin nhắn đang được xử lý.` });

      // Poll progress (vì Socket.IO có thể không available trên frontend)
      const pollInterval = setInterval(async () => {
        try {
          const hRes = await authFetch(`${API_BASE}/api/remarketing/history`);
          const hData = await hRes.json();
          const campaign = hData.campaigns?.[0];
          if (campaign && campaign.id === data.id) {
            const pct = campaign.total > 0 ? Math.round(((campaign.sent + campaign.failed) / campaign.total) * 100) : 0;
            setProgress({ total: campaign.total, sent: campaign.sent || 0, failed: campaign.failed || 0, current: (campaign.sent || 0) + (campaign.failed || 0), percent: pct, status: campaign.status });
            if (campaign.status === "completed" || campaign.status === "failed") {
              clearInterval(pollInterval);
              setSending(false);
              toast({ title: campaign.status === "completed" ? "✅ Gửi xong!" : "⚠️ Có lỗi", description: `${campaign.sent} thành công${campaign.failed > 0 ? `, ${campaign.failed} lỗi` : ""}` });
            }
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
      setSending(false);
      setProgress(null);
    }
  };

  // Load history
  const loadHistory = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/remarketing/history`);
      const data = await res.json();
      setHistory(data.campaigns || []);
      setShowHistory(true);
    } catch { /* */ }
  };

  // Preview message
  const previewMessage = message.replace(/\{\{name\}\}/gi, "Nguyễn Văn A");

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-rose-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Re-marketing</h1>
              <p className="text-xs text-zinc-500">Gửi tin nhắn hàng loạt cho khách hàng theo bộ lọc thông minh</p>
            </div>
          </div>
          <button onClick={loadHistory}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-xl transition-all">
            <History className="w-3.5 h-3.5" /> Lịch sử gửi
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto px-8 py-6 space-y-5">

          {/* === STEP 1: Soạn tin nhắn === */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-bold text-zinc-800">Bước 1: Soạn tin nhắn</h2>
              </div>
              <button onClick={insertVariable}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-all">
                <Zap className="w-3 h-3" /> Chèn {"{{name}}"}
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Template pills */}
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((t) => (
                  <button key={t.label} onClick={() => setMessage(t.text)}
                    className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg transition-all hover:text-zinc-700">
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Soạn nội dung tin nhắn... Dùng {{name}} để gọi tên khách."
                rows={5}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 resize-none"
              />

              {/* Image URL */}
              <div className="flex items-center gap-2">
                <ImagePlus className="w-4 h-4 text-zinc-400" />
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="URL hình ảnh đính kèm (tùy chọn)"
                  className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300"
                />
              </div>

              {/* Preview */}
              {message && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-700 mb-2">
                    <Eye className="w-3 h-3" /> Xem trước (khách nhận)
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-blue-100 text-sm text-zinc-700 whitespace-pre-wrap">
                    {previewMessage}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* === STEP 2: Bộ lọc đối tượng === */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-500" />
              <h2 className="text-sm font-bold text-zinc-800">Bước 2: Chọn đối tượng</h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Filter mode */}
              <div className="flex gap-2">
                <button onClick={() => { setFilterMode("all"); setSelectedTags([]); }}
                  className={cn("px-4 py-2 text-xs font-semibold rounded-xl transition-all border",
                    filterMode === "all" ? "bg-teal-500 text-white border-teal-500 shadow-md" : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100")}>
                  <Users className="w-3 h-3 inline mr-1" /> Tất cả khách hàng
                </button>
                <button onClick={() => setFilterMode("tags")}
                  className={cn("px-4 py-2 text-xs font-semibold rounded-xl transition-all border",
                    filterMode === "tags" ? "bg-teal-500 text-white border-teal-500 shadow-md" : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100")}>
                  <Tag className="w-3 h-3 inline mr-1" /> Lọc theo Thẻ (Tags)
                </button>
              </div>

              {/* Tag selector */}
              {filterMode === "tags" && (
                <div className="flex flex-wrap gap-2 p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
                  {allTags.length === 0 ? (
                    <span className="text-xs text-zinc-400">Chưa có thẻ nào. Tạo thẻ tại mục &ldquo;Quản lý Thẻ&rdquo;.</span>
                  ) : (
                    allTags.map((tag) => (
                      <button key={tag.id} onClick={() => toggleTag(tag.id)}
                        className={cn("px-3 py-1.5 text-xs font-semibold rounded-full transition-all border",
                          selectedTags.includes(tag.id)
                            ? "text-white shadow-sm"
                            : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
                        )}
                        style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color || "#6366f1", borderColor: tag.color || "#6366f1" } : {}}>
                        {tag.name}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Preview count */}
              <div className="flex items-center gap-2 text-xs">
                <div className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg border font-semibold",
                  previewCount > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-50 text-zinc-400 border-zinc-200")}>
                  {loadingPreview ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
                  {loadingPreview ? "Đang đếm..." : `${previewCount ?? "..."} khách hàng sẽ nhận tin`}
                </div>
              </div>
            </div>
          </div>

          {/* === Progress Bar (khi đang gửi) === */}
          {progress && (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-orange-500" />
                  <h2 className="text-sm font-bold text-zinc-800">Tiến độ gửi tin</h2>
                </div>
                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full",
                  progress.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                  progress.status === "failed" ? "bg-red-50 text-red-600" :
                  "bg-orange-50 text-orange-600")}>
                  {progress.status === "completed" ? "✅ Hoàn tất" :
                   progress.status === "failed" ? "❌ Thất bại" :
                   `${progress.percent}%`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-orange-500 to-rose-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progress.percent}%` }} />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-50 rounded-xl p-3 text-center border border-zinc-100">
                  <div className="text-lg font-bold text-zinc-800">{progress.current || 0}/{progress.total}</div>
                  <div className="text-[10px] text-zinc-500">Đã xử lý</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                  <div className="text-lg font-bold text-emerald-600">{progress.sent}</div>
                  <div className="text-[10px] text-emerald-600">Thành công</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                  <div className="text-lg font-bold text-red-500">{progress.failed}</div>
                  <div className="text-[10px] text-red-500">Lỗi</div>
                </div>
              </div>

              {sending && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Delay 2.5 giây giữa mỗi tin nhắn để bảo vệ Fanpage khỏi spam...
                </div>
              )}
            </div>
          )}

          {/* === Nút GỬI === */}
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDialog(true)}
              disabled={!message.trim() || sending || previewCount === 0}
              className={cn("flex items-center gap-2 px-8 py-3 text-white text-sm font-bold rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]",
                (!message.trim() || sending || previewCount === 0) ? "bg-zinc-300 cursor-not-allowed shadow-none" : "bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700")}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {sending ? "Đang gửi..." : `Gửi cho ${previewCount ?? 0} khách hàng`}
            </button>
          </div>
        </div>
      </ScrollArea>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="w-5 h-5" /> Xác nhận gửi tin
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600">
            Bạn sắp gửi <strong>{previewCount}</strong> tin nhắn
            {filterMode === "tags" && selectedTags.length > 0 && " (lọc theo thẻ)"}. Facebook có tốc độ gửi giới hạn, quá trình sẽ mất khoảng <strong>{Math.ceil((previewCount || 0) * 2.5 / 60)} phút</strong>.
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setConfirmDialog(false)}
              className="flex-1 py-2.5 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all">
              Hủy
            </button>
            <button onClick={handleSend}
              className="flex-1 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-rose-600 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1">
              <Rocket className="w-3 h-3" /> Xác nhận gửi
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg max-h-[70vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-zinc-500" /> Lịch sử gửi tin
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-8">Chưa có chiến dịch nào.</p>
              ) : (
                history.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                    <div>
                      <p className="text-xs font-semibold text-zinc-700">{c.name}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[250px]">{c.message}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                        c.status === "completed" ? "bg-emerald-50 text-emerald-600" :
                        c.status === "sending" ? "bg-orange-50 text-orange-600" :
                        c.status === "failed" ? "bg-red-50 text-red-500" :
                        "bg-zinc-100 text-zinc-400")}>
                        {c.status === "completed" ? "✅ Xong" : c.status === "sending" ? "🔄 Đang gửi" : c.status === "failed" ? "❌ Lỗi" : "📝 Nháp"}
                      </span>
                      <p className="text-[9px] text-zinc-400 mt-1">
                        {c.sent || 0}/{c.total} • {new Date(c.created_at).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
