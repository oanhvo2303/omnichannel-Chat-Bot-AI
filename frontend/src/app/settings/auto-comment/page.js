"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MessageSquareReply, Plus, Trash2, Save, Loader2, AlertTriangle,
  Power, PowerOff, Eye, EyeOff, Inbox, MessagesSquare, Hash,
  Sparkles, Shield, FileText, PenLine, X, Shuffle, Globe
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const authFetch = async (url, opts = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers } });
};

// Spintax preview — resolve {A|B|C} randomly
const resolveSpintax = (text) => {
  if (!text) return "";
  return text.replace(/\{([^}]+)\}/g, (_, group) => {
    const options = group.split("|");
    return options[Math.floor(Math.random() * options.length)].trim();
  });
};

export default function AutoCommentPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  // Form fields
  const [formPostId, setFormPostId] = useState("ALL");
  const [formKeywords, setFormKeywords] = useState("");
  const [formReplyText, setFormReplyText] = useState("");
  const [formInboxText, setFormInboxText] = useState("");
  const [formAutoHide, setFormAutoHide] = useState(true);
  const [saving, setSaving] = useState(false);

  // Spintax preview
  const [previewReply, setPreviewReply] = useState("");
  const [previewInbox, setPreviewInbox] = useState("");

  // Delete state
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(null);

  useEffect(() => { fetchRules(); }, []);

  const fetchRules = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/comment-rules`);
      const data = await res.json();
      setRules(data || []);
    } catch { /* */ }
    finally { setLoading(false); }
  };

  // Open dialog for create
  const openCreateDialog = () => {
    setEditingRule(null);
    setFormPostId("ALL");
    setFormKeywords("");
    setFormReplyText("");
    setFormInboxText("");
    setFormAutoHide(true);
    setPreviewReply("");
    setPreviewInbox("");
    setDialogOpen(true);
  };

  // Open dialog for edit
  const openEditDialog = (rule) => {
    setEditingRule(rule);
    setFormPostId(rule.post_id || "ALL");
    setFormKeywords(rule.trigger_keywords ? rule.trigger_keywords.join(", ") : "");
    setFormReplyText(rule.reply_text || "");
    setFormInboxText(rule.inbox_text || "");
    setFormAutoHide(!!rule.auto_hide);
    setPreviewReply("");
    setPreviewInbox("");
    setDialogOpen(true);
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!formReplyText.trim() && !formInboxText.trim()) {
      toast({ title: "❌ Thiếu nội dung", description: "Cần ít nhất nội dung Rep Comment hoặc Inbox.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        post_id: formPostId.trim() || "ALL",
        trigger_keywords: formKeywords.trim()
          ? formKeywords.split(",").map((k) => k.trim()).filter(Boolean)
          : null,
        reply_text: formReplyText.trim() || null,
        inbox_text: formInboxText.trim() || null,
        auto_hide: formAutoHide,
      };

      if (editingRule) {
        // Update
        const res = await authFetch(`${API_BASE}/api/comment-rules/${editingRule.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast({ title: "✅ Đã cập nhật luật" });
          fetchRules();
          setDialogOpen(false);
        } else {
          const data = await res.json();
          toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
        }
      } else {
        // Create
        const res = await authFetch(`${API_BASE}/api/comment-rules`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
          setRules((prev) => [data, ...prev]);
          toast({ title: "⚡ Tạo luật mới", description: `Luật #${data.id} đã sẵn sàng.` });
          setDialogOpen(false);
        } else {
          toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
        }
      }
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Delete
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await authFetch(`${API_BASE}/api/comment-rules/${deleteId}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== deleteId));
      toast({ title: "🗑️ Đã xóa luật" });
    } catch { /* */ }
    finally { setDeleting(false); setDeleteId(null); }
  };

  // Toggle
  const handleToggle = async (rule) => {
    setToggling(rule.id);
    try {
      await authFetch(`${API_BASE}/api/comment-rules/${rule.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: rule.is_active ? 0 : 1 }),
      });
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: r.is_active ? 0 : 1 } : r));
      toast({ title: rule.is_active ? "⏸️ Đã tắt" : "▶️ Đã bật" });
    } catch { /* */ }
    finally { setToggling(null); }
  };

  // Refresh Spintax preview
  const refreshPreview = () => {
    setPreviewReply(resolveSpintax(formReplyText));
    setPreviewInbox(resolveSpintax(formInboxText));
  };

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <MessageSquareReply className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Tự động Trả lời Comment</h1>
              <p className="text-xs text-zinc-500">Auto-reply comment + Private inbox + Ẩn SĐT chống cướp khách</p>
            </div>
          </div>
          <button onClick={openCreateDialog}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]">
            <Plus className="w-4 h-4" /> Tạo Luật Mới
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto px-8 py-6 space-y-4">

          {/* Info Banner */}
          <div className="bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-xl p-4 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-cyan-800 leading-relaxed space-y-1">
              <p><strong>Luồng xử lý:</strong> Khách comment → Hệ thống check từ khóa → <strong>Reply dưới comment</strong> + <strong>Gửi inbox ẩn</strong> + <strong>Ẩn SĐT</strong></p>
              <p><strong>Spintax:</strong> Dùng cú pháp <code className="bg-white/60 px-1 py-0.5 rounded">{`{Dạ|Vâng|Hi}`}</code> để Bot trả lời đa dạng, tránh Facebook đánh spam.</p>
              <p><strong>Bài Ads:</strong> Hệ thống tự bắt comment từ bài quảng cáo. Để Post ID = <code className="bg-white/60 px-1 py-0.5 rounded">ALL</code> để áp dụng cho mọi bài viết.</p>
            </div>
          </div>

          {/* Rules List */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang tải...
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto">
                <MessageSquareReply className="w-8 h-8 text-zinc-300" />
              </div>
              <p className="text-sm text-zinc-500 font-medium">Chưa có luật auto-reply nào</p>
              <p className="text-xs text-zinc-400">Bấm &quot;Tạo Luật Mới&quot; để bắt đầu tự động reply comment.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id}
                  className={cn(
                    "bg-white rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden",
                    rule.is_active ? "border-zinc-200" : "border-zinc-200 opacity-50"
                  )}>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Rule info */}
                      <div className="flex-1 space-y-3 min-w-0">
                        {/* Top pills row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Post ID badge */}
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border",
                            rule.post_id === "ALL"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200")}>
                            <Globe className="w-2.5 h-2.5 inline mr-0.5" />
                            {rule.post_id === "ALL" ? "Mọi bài viết" : `Post: ${rule.post_id.substring(0, 20)}...`}
                          </span>

                          {/* Keywords */}
                          {rule.trigger_keywords && rule.trigger_keywords.length > 0 ? (
                            rule.trigger_keywords.slice(0, 5).map((kw, i) => (
                              <span key={i} className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                                {kw}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
                              🎯 Bắt mọi comment
                            </span>
                          )}

                          {/* Auto-hide badge */}
                          {rule.auto_hide ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-50 text-red-600 rounded border border-red-200 flex items-center gap-0.5">
                              <Shield className="w-2.5 h-2.5" /> Ẩn SĐT
                            </span>
                          ) : null}
                        </div>

                        {/* Reply & Inbox preview */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {rule.reply_text && (
                            <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                              <div className="flex items-center gap-1 text-[9px] font-bold text-zinc-400 mb-1.5">
                                <MessagesSquare className="w-3 h-3" /> REP COMMENT
                              </div>
                              <p className="text-[11px] text-zinc-600 whitespace-pre-wrap leading-relaxed line-clamp-3">{rule.reply_text}</p>
                            </div>
                          )}
                          {rule.inbox_text && (
                            <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                              <div className="flex items-center gap-1 text-[9px] font-bold text-blue-400 mb-1.5">
                                <Inbox className="w-3 h-3" /> GỬI INBOX ẨN
                              </div>
                              <p className="text-[11px] text-blue-700 whitespace-pre-wrap leading-relaxed line-clamp-3">{rule.inbox_text}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEditDialog(rule)}
                          className="p-2 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 transition-all">
                          <PenLine className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleToggle(rule)} disabled={toggling === rule.id}
                          className={cn("p-2 rounded-lg transition-all",
                            rule.is_active ? "text-emerald-500 hover:bg-emerald-50" : "text-zinc-400 hover:bg-zinc-100")}>
                          {toggling === rule.id ? <Loader2 className="w-4 h-4 animate-spin" /> : rule.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setDeleteId(rule.id)}
                          className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ═══════════════════════════════════════════ */}
      {/* ★★★ CREATE / EDIT DIALOG ★★★              */}
      {/* ═══════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareReply className="w-5 h-5 text-cyan-600" />
              {editingRule ? "Sửa luật Auto-Reply" : "Tạo luật Auto-Reply mới"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Post ID */}
            <div>
              <label className="text-xs font-bold text-zinc-700 mb-1.5 flex items-center gap-1">
                <Globe className="w-3 h-3 text-zinc-400" /> Áp dụng cho bài viết
              </label>
              <input value={formPostId} onChange={(e) => setFormPostId(e.target.value)}
                placeholder='ALL (mọi bài) hoặc nhập Post ID cụ thể'
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-300" />
              <p className="text-[10px] text-zinc-400 mt-1">Để &quot;ALL&quot; để bắt comment từ tất cả bài viết (cả bài Ads).</p>
            </div>

            {/* Keywords */}
            <div>
              <label className="text-xs font-bold text-zinc-700 mb-1.5 flex items-center gap-1">
                <Hash className="w-3 h-3 text-zinc-400" /> Từ khóa kích hoạt
              </label>
              <input value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)}
                placeholder='VD: giá, bao nhiêu, inbox, ship (phân cách dấu phẩy) — Bỏ trống = bắt tất cả'
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-300" />
              <p className="text-[10px] text-zinc-400 mt-1">Bỏ trống = bắt <strong>mọi comment</strong> (catch-all). Có thể nhập nhiều từ khóa cách nhau bởi dấu phẩy.</p>
            </div>

            {/* Reply Text */}
            <div>
              <label className="text-xs font-bold text-zinc-700 mb-1.5 flex items-center gap-1">
                <MessagesSquare className="w-3 h-3 text-zinc-400" /> Trả lời dưới Comment
              </label>
              <textarea value={formReplyText} onChange={(e) => setFormReplyText(e.target.value)} rows={3}
                placeholder='{Dạ|Vâng|Hi} chào bạn! Shop đã nhận được tin nhắn, {bạn inbox shop nhé|mình rep inbox ngay ạ} 😊'
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-300 resize-none leading-relaxed" />
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px] text-zinc-400">
                  Dùng <code className="bg-zinc-100 px-1 rounded">{`{A|B|C}`}</code> để xoay vòng tránh spam.
                </p>
                <button onClick={refreshPreview}
                  className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded-lg transition-colors">
                  <Shuffle className="w-3 h-3" /> Xem Spintax
                </button>
              </div>
              {previewReply && (
                <div className="mt-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-[11px] text-violet-700">
                  <strong>Preview:</strong> {previewReply}
                </div>
              )}
            </div>

            {/* Inbox Text */}
            <div>
              <label className="text-xs font-bold text-zinc-700 mb-1.5 flex items-center gap-1">
                <Inbox className="w-3 h-3 text-zinc-400" /> Gửi Inbox ẩn (Private Reply)
              </label>
              <textarea value={formInboxText} onChange={(e) => setFormInboxText(e.target.value)} rows={3}
                placeholder="Chào bạn! Cảm ơn đã quan tâm sản phẩm. Mình gửi báo giá chi tiết cho bạn nhé..."
                className="w-full px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 resize-none leading-relaxed" />
              <p className="text-[10px] text-zinc-400 mt-1">Tin nhắn sẽ được gửi vào Inbox của người comment (Private Reply API). Lưu ý: Sẽ lỗi nếu user chặn nhận tin nhắn.</p>
              {previewInbox && (
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[11px] text-blue-700">
                  <strong>Preview:</strong> {previewInbox}
                </div>
              )}
            </div>

            {/* Auto-hide toggle */}
            <div className="flex items-center justify-between bg-red-50/50 border border-red-100 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" />
                <div>
                  <p className="text-xs font-bold text-zinc-700">Tự động ẩn comment chứa SĐT</p>
                  <p className="text-[10px] text-zinc-400">Chống cướp khách: Phát hiện số điện thoại → ẩn ngay</p>
                </div>
              </div>
              <button onClick={() => setFormAutoHide(!formAutoHide)}
                className={cn(
                  "w-11 h-6 rounded-full transition-all relative",
                  formAutoHide ? "bg-red-500" : "bg-zinc-300"
                )}>
                <div className={cn(
                  "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm",
                  formAutoHide ? "left-[22px]" : "left-0.5"
                )} />
              </button>
            </div>

            {/* Save button */}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setDialogOpen(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all">
                Hủy
              </button>
              <button onClick={handleSave} disabled={saving}
                className={cn("flex-1 py-2.5 text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1",
                  saving ? "bg-zinc-200 text-zinc-500" : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white")}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Đang lưu..." : editingRule ? "Cập nhật" : "Tạo Luật"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Xóa luật auto-reply?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600">Luật này sẽ bị xóa vĩnh viễn. Bot sẽ không tự reply comment theo luật này nữa.</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setDeleteId(null)}
              className="flex-1 py-2 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all">Hủy</button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1">
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              {deleting ? "Đang xóa..." : "Xóa luật"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
