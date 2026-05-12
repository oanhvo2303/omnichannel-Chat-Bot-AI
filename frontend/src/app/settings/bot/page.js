"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Bot, Sparkles, MessageCircle, Zap, Plus, Trash2, Save, Lightbulb,
  Image, Type, Power, PowerOff, Loader2, PenLine, AlertTriangle,
  Upload, X, CheckCircle2, GripVertical, Clock, ChevronDown, ChevronUp, Layers, Filter, Globe
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const authFetch = async (url, opts = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers } });
};

// Generate unique step ID
const genStepId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// Default empty step
const createEmptyStep = (index) => ({
  id: genStepId(),
  text: "",
  media_urls: [],
  delay_seconds: index === 0 ? 0 : 2,
});

export default function BotSettingsPage() {
  const [aiPrompt, setAiPrompt] = useState(
    "Bạn là trợ lý bán hàng thông minh. Hãy trả lời khách hàng một cách chuyên nghiệp, thân thiện. Luôn gợi ý sản phẩm phù hợp và hỗ trợ chốt đơn nhanh chóng."
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Xin chào! 👋 Cảm ơn bạn đã nhắn tin cho Shop. Mình có thể giúp gì cho bạn?"
  );

  // Bot Rules from DB
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pages (Integrations) for per-page filter
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState(""); // "" = All, number = specific page

  // New rule form
  const [newKeyword, setNewKeyword] = useState("");
  const [newMatchType, setNewMatchType] = useState("contains");
  const [newPageId, setNewPageId] = useState("");
  const [newSteps, setNewSteps] = useState([createEmptyStep(0)]);
  const [adding, setAdding] = useState(false);

  // Upload state per step
  const [uploadingStepId, setUploadingStepId] = useState(null);
  const fileInputRefs = useRef({});

  // Delete dialog
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Toggle
  const [toggling, setToggling] = useState(null);

  // Edit rule
  const [editRule, setEditRule] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const editFileRefs = useRef({});
  const [editUploadingStepId, setEditUploadingStepId] = useState(null);

  // Expand/Collapse rule details
  const [expandedRuleId, setExpandedRuleId] = useState(null);

  // ★ Media Library
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryItems, setLibraryItems] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState(null); // { stepId, mode: 'new'|'edit' }

  // Load pages + rules
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/integrations`);
        if (res.ok) {
          const data = await res.json();
          const list = data.integrations || data || [];
          setPages(Array.isArray(list) ? list.filter(i => i.status === 'connected' && (i.page_name || i.page_id)) : []);
        }
      } catch { /* */ }
    })();
    fetchRules();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload rules when page filter changes
  useEffect(() => {
    fetchRules();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageId]);

  const fetchRules = async () => {
    try {
      const qs = selectedPageId ? `?integration_id=${selectedPageId}` : '';
      const res = await authFetch(`${API_BASE}/api/bot-rules${qs}`);
      const data = await res.json();
      setRules(data || []);
    } catch { /* */ }
    finally { setLoading(false); }
  };

  // === UPLOAD ẢNH PER STEP ===
  const handleStepFileChange = async (stepId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingStepId(stepId);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setNewSteps((prev) =>
          prev.map((s) =>
            s.id === stepId ? { ...s, media_urls: [...s.media_urls, data.url] } : s
          )
        );
        toast({ title: "✅ Upload thành công", description: `${file.name}` });
      } else {
        toast({ title: "❌ Lỗi upload", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally {
      setUploadingStepId(null);
      // Reset input
      if (fileInputRefs.current[stepId]) fileInputRefs.current[stepId].value = "";
    }
  };

  const removeStepMedia = (stepId, mediaIndex) => {
    setNewSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? { ...s, media_urls: s.media_urls.filter((_, i) => i !== mediaIndex) }
          : s
      )
    );
  };

  // ★ Video helper
  const isVideoUrl = (url) => /\.(mp4|webm|mov|avi)$/i.test(url || '');

  // ★ Media Library functions
  const openLibrary = async (stepId, mode = 'new') => {
    setLibraryTarget({ stepId, mode });
    setShowLibrary(true);
    setLibraryLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/upload/library`);
      const data = await res.json();
      setLibraryItems(data.items || []);
    } catch { setLibraryItems([]); }
    finally { setLibraryLoading(false); }
  };

  const pickFromLibrary = (url) => {
    if (!libraryTarget) return;
    const { stepId, mode } = libraryTarget;
    if (mode === 'new') {
      setNewSteps(prev => prev.map(s =>
        s.id === stepId ? { ...s, media_urls: [...s.media_urls, url] } : s
      ));
    } else {
      setEditRule(prev => ({
        ...prev,
        steps: prev.steps.map(s =>
          s.id === stepId ? { ...s, media_urls: [...(s.media_urls || []), url] } : s
        ),
      }));
    }
    setShowLibrary(false);
  };

  const deleteLibraryItem = async (id) => {
    try {
      await authFetch(`${API_BASE}/api/upload/library/${id}`, { method: 'DELETE' });
      setLibraryItems(prev => prev.filter(i => i.id !== id));
      toast({ title: '\ud83d\uddd1\ufe0f Đã xóa khỏi thư viện' });
    } catch { }
  };

  // === STEP MANAGEMENT ===
  const addStep = () => {
    setNewSteps((prev) => [...prev, createEmptyStep(prev.length)]);
  };

  const removeStep = (stepId) => {
    setNewSteps((prev) => {
      if (prev.length <= 1) return prev; // Must keep at least 1 step
      return prev.filter((s) => s.id !== stepId);
    });
  };

  const updateStep = (stepId, field, value) => {
    setNewSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, [field]: value } : s))
    );
  };

  const moveStep = (index, direction) => {
    setNewSteps((prev) => {
      const newArr = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= newArr.length) return prev;
      [newArr[index], newArr[targetIndex]] = [newArr[targetIndex], newArr[index]];
      return newArr;
    });
  };

  // === ADD RULE ===
  const handleAddRule = async () => {
    if (!newKeyword.trim()) {
      toast({ title: "❌ Thiếu từ khóa", variant: "destructive" }); return;
    }
    // Validate: at least 1 step with content
    const validSteps = newSteps.filter((s) => s.text.trim() || s.media_urls.length > 0);
    if (validSteps.length === 0) {
      toast({ title: "❌ Cần ít nhất 1 bước có nội dung", variant: "destructive" }); return;
    }

    setAdding(true);
    try {
      const res = await authFetch(`${API_BASE}/api/bot-rules`, {
        method: "POST",
        body: JSON.stringify({
          keywords: newKeyword,
          match_type: newMatchType,
          steps: newSteps,
          integration_id: newPageId || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRules((prev) => [data, ...prev]);
        setNewKeyword("");
        setNewMatchType("contains");
        setNewPageId("");
        setNewSteps([createEmptyStep(0)]);
        toast({ title: "⚡ Thêm kịch bản mới", description: `"${newKeyword}" — ${validSteps.length} bước` });
      } else {
        toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally { setAdding(false); }
  };

  // Delete rule
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await authFetch(`${API_BASE}/api/bot-rules/${deleteId}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== deleteId));
      toast({ title: "🗑️ Đã xóa kịch bản" });
    } catch { /* */ }
    finally { setDeleting(false); setDeleteId(null); }
  };

  // Toggle active/inactive
  const handleToggle = async (rule) => {
    setToggling(rule.id);
    try {
      await authFetch(`${API_BASE}/api/bot-rules/${rule.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: rule.is_active ? 0 : 1 }),
      });
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: r.is_active ? 0 : 1 } : r));
      toast({ title: rule.is_active ? "⏸️ Đã tắt" : "▶️ Đã bật" });
    } catch { /* */ }
    finally { setToggling(null); }
  };

  const handleSave = () => {
    toast({ title: "✅ Đã lưu cài đặt Bot", description: "Cấu hình AI Prompt và câu chào đã được cập nhật." });
  };

  // === EDIT RULE ===
  const openEditRule = (rule) => {
    setEditRule({
      id: rule.id,
      keywords: rule.keywords,
      match_type: rule.match_type || 'contains',
      integration_id: rule.integration_id || null,
      steps: rule.steps && rule.steps.length > 0
        ? rule.steps.map(s => ({ ...s, id: s.id || genStepId(), media_urls: s.media_urls || [] }))
        : [{ id: genStepId(), text: rule.response || '', media_urls: [], delay_seconds: 0 }],
    });
  };

  const updateEditStep = (stepId, field, value) => {
    setEditRule(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.id === stepId ? { ...s, [field]: value } : s),
    }));
  };

  const addEditStep = () => {
    setEditRule(prev => ({
      ...prev,
      steps: [...prev.steps, createEmptyStep(prev.steps.length)],
    }));
  };

  const removeEditStep = (stepId) => {
    setEditRule(prev => ({
      ...prev,
      steps: prev.steps.length <= 1 ? prev.steps : prev.steps.filter(s => s.id !== stepId),
    }));
  };

  const moveEditStep = (index, direction) => {
    setEditRule(prev => {
      const arr = [...prev.steps];
      const target = index + direction;
      if (target < 0 || target >= arr.length) return prev;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return { ...prev, steps: arr };
    });
  };

  const handleEditStepUpload = async (stepId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditUploadingStepId(stepId);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        updateEditStep(stepId, 'media_urls', [...(editRule.steps.find(s => s.id === stepId)?.media_urls || []), data.url]);
        toast({ title: "✅ Upload thành công" });
      }
    } catch { }
    finally {
      setEditUploadingStepId(null);
      if (editFileRefs.current[stepId]) editFileRefs.current[stepId].value = "";
    }
  };

  const removeEditStepMedia = (stepId, mediaIndex) => {
    setEditRule(prev => ({
      ...prev,
      steps: prev.steps.map(s =>
        s.id === stepId ? { ...s, media_urls: s.media_urls.filter((_, i) => i !== mediaIndex) } : s
      ),
    }));
  };

  const handleSaveEdit = async () => {
    if (!editRule) return;
    if (!editRule.keywords.trim()) {
      toast({ title: "❌ Từ khóa không được trống", variant: "destructive" }); return;
    }
    const validSteps = editRule.steps.filter(s => s.text.trim() || s.media_urls.length > 0);
    if (validSteps.length === 0) {
      toast({ title: "❌ Cần ít nhất 1 bước có nội dung", variant: "destructive" }); return;
    }
    setEditSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/api/bot-rules/${editRule.id}`, {
        method: "PUT",
        body: JSON.stringify({
          keywords: editRule.keywords,
          match_type: editRule.match_type,
          integration_id: editRule.integration_id,
          steps: editRule.steps,
          response: editRule.steps[0]?.text || '',
        }),
      });
      if (res.ok) {
        toast({ title: "✅ Đã cập nhật kịch bản", description: `"${editRule.keywords}" — ${validSteps.length} bước` });
        setEditRule(null);
        fetchRules();
      } else {
        const data = await res.json();
        toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally { setEditSaving(false); }
  };

  // Helper: format delay display
  const formatDelay = (sec) => {
    if (!sec || sec === 0) return "Ngay lập tức";
    return `Chờ ${sec}s`;
  };

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Kịch bản Bot</h1>
              <p className="text-xs text-zinc-500">Cấu hình kịch bản đa bước, câu chào mừng — theo từng Page</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Page Filter Dropdown */}
            <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-xl">
              <Filter className="w-3.5 h-3.5 text-violet-500" />
              <select value={selectedPageId} onChange={(e) => setSelectedPageId(e.target.value)}
                className="text-xs font-semibold text-zinc-700 bg-transparent outline-none cursor-pointer">
                <option value="">Tất cả Pages</option>
                {pages.map(p => (
                  <option key={p.id} value={p.id}>{p.page_name || p.page_id}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto px-8 py-6 space-y-6">

          {/* AI Prompt Card → Redirect to Integrations */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <h2 className="text-sm font-bold text-zinc-800">AI Prompt (Tính cách Bot)</h2>
            </div>
            <div className="p-6">
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-violet-800">Mỗi Page có Prompt riêng</p>
                  <p className="text-[11px] text-violet-600 mt-1 leading-relaxed">
                    Tính cách AI được cấu hình riêng cho từng Fanpage tại trang <strong>Kết nối Đa kênh</strong>. 
                    Điều này giúp bạn có thể đặt phong cách trả lời khác nhau cho mỗi Page (ví dụ: Page A bán mỹ phẩm → AI tư vấn nhẹ nhàng, Page B bán đồ điện tử → AI tư vấn kỹ thuật).
                  </p>
                  <a href="/settings/integrations"
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold text-white bg-violet-500 hover:bg-violet-600 rounded-lg transition-all shadow-sm">
                    <Zap className="w-3 h-3" /> Cấu hình tại Kết nối Đa kênh →
                  </a>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-400">
                <Lightbulb className="w-3 h-3" />
                <span>Tip: Nên nêu rõ &quot;luôn hỏi SĐT&quot; trong prompt nếu muốn Bot tự trích xuất liên hệ.</span>
              </div>
            </div>
          </div>

          {/* Welcome Message Card */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-bold text-zinc-800">Câu chào mừng</h2>
            </div>
            <div className="p-6">
              <p className="text-xs text-zinc-500 mb-3">Tin nhắn tự động gửi cho khách lần đầu nhắn tin vào Fanpage (Get Started).</p>
              <textarea value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} rows={3}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 resize-none" />
            </div>
          </div>

          {/* ═══════════════════════════════════════════ */}
          {/* Keyword Rules Card — MULTI-STEP           */}
          {/* ═══════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold text-zinc-800">Kịch bản từ khóa (Đa bước)</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">{rules.length} kịch bản</span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-zinc-500">Khi khách nhắn tin chứa từ khóa → Bot gửi <strong>tuần tự nhiều bước</strong> tin nhắn (text + ảnh + delay) mà <strong>không gọi AI</strong>.</p>

              {/* Existing Rules */}
              {loading ? (
                <div className="flex items-center justify-center py-8 text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang tải...
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center py-8 text-zinc-400 text-sm">Chưa có kịch bản nào. Thêm ngay bên dưới!</div>
              ) : (
                rules.map((rule) => {
                  const stepsCount = rule.steps?.length || 0;
                  const isExpanded = expandedRuleId === rule.id;

                  return (
                    <div key={rule.id}
                      className={cn("rounded-xl border overflow-hidden transition-all",
                        rule.is_active ? "bg-zinc-50 border-zinc-200" : "bg-zinc-100/50 border-zinc-200 opacity-50")}>
                      {/* Rule Header */}
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-100/50 transition-colors"
                        onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Keywords pills */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {rule.keywords.split(",").map((kw, i) => (
                              <span key={i} className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">{kw.trim()}</span>
                            ))}
                          </div>

                          {/* Steps badge */}
                          {stepsCount > 0 ? (
                            <span className="text-[9px] font-bold px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full border border-violet-200 flex items-center gap-1">
                              <Layers className="w-2.5 h-2.5" /> {stepsCount} bước
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded border border-zinc-200">
                              📝 Text đơn
                            </span>
                          )}

                          {/* Match type */}
                          <span className="text-[9px] font-medium text-zinc-400 px-1.5 py-0.5 bg-zinc-50 rounded border border-zinc-200">
                            {rule.match_type === "exact" ? "Khớp chính xác" : rule.match_type === "startswith" ? "Bắt đầu bằng" : "Chứa từ khóa"}
                          </span>

                          {/* Page badge */}
                          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5",
                            rule.integration_id 
                              ? "bg-indigo-50 text-indigo-600 border-indigo-200" 
                              : "bg-zinc-50 text-zinc-400 border-zinc-200"
                          )}>
                            <Globe className="w-2.5 h-2.5" />
                            {rule.integration_id ? (pages.find(p => p.id === rule.integration_id)?.page_name || 'Page') : 'Chung'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); openEditRule(rule); }}
                            className="p-1.5 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Chỉnh sửa">
                            <PenLine className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleToggle(rule); }} disabled={toggling === rule.id}
                            className={cn("p-1.5 rounded-lg transition-all",
                              rule.is_active ? "text-emerald-500 hover:bg-emerald-50" : "text-zinc-400 hover:bg-zinc-100")}>
                            {toggling === rule.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : rule.is_active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteId(rule.id); }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <div className="p-1 text-zinc-300">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </div>
                        </div>
                      </div>

                      {/* Expanded: Show steps preview */}
                      {isExpanded && (
                        <div className="border-t border-zinc-200 bg-white p-4 space-y-2">
                          {stepsCount > 0 ? (
                            rule.steps.map((step, idx) => (
                              <div key={step.id || idx} className="flex items-start gap-3 text-xs">
                                <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                                  {idx + 1}
                                </div>
                                <div className="flex-1 space-y-1">
                                  {step.delay_seconds > 0 && (
                                    <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                      ⏳ Chờ {step.delay_seconds}s
                                    </span>
                                  )}
                                  {step.media_urls?.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                      {step.media_urls.map((url, mi) => (
                                        <img key={mi} src={url} alt="" className="w-16 h-12 object-cover rounded-lg border" />
                                      ))}
                                    </div>
                                  )}
                                  {step.text && (
                                    <p className="text-zinc-600 whitespace-pre-wrap leading-relaxed">{step.text}</p>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-zinc-600 whitespace-pre-wrap">{rule.response}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* ═══════════════════════════════════════════════ */}
              {/* ★★★ STEP BUILDER — THÊM KỊCH BẢN MỚI ★★★      */}
              {/* ═══════════════════════════════════════════════ */}
              <div className="border-2 border-dashed border-zinc-200 rounded-xl p-5 space-y-5 hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                  <PenLine className="w-3.5 h-3.5" /> Thêm kịch bản mới (Đa bước)
                </div>

                {/* Keyword input + Match type */}
                <div className="flex gap-2 flex-wrap">
                  <input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder='Từ khóa (phân cách dấu phẩy, VD: "stk, chuyển khoản")'
                    className="flex-1 min-w-[200px] px-3 py-2.5 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
                  <select value={newMatchType} onChange={(e) => setNewMatchType(e.target.value)}
                    className="px-3 py-2 text-[11px] font-semibold bg-zinc-50 border border-zinc-200 rounded-lg outline-none text-zinc-600">
                    <option value="contains">Chứa từ khóa</option>
                    <option value="exact">Khớp chính xác</option>
                    <option value="startswith">Bắt đầu bằng</option>
                  </select>
                </div>

                {/* Page selector */}
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  <select value={newPageId} onChange={(e) => setNewPageId(e.target.value)}
                    className="px-3 py-2 text-[11px] font-semibold bg-zinc-50 border border-zinc-200 rounded-lg outline-none text-zinc-600">
                    <option value="">🌐 Chung (Tất cả Pages)</option>
                    {pages.map(p => (
                      <option key={p.id} value={p.id}>📄 {p.page_name || p.page_id}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-zinc-400">Áp dụng cho</span>
                </div>

                {/* ★★★ STEP CARDS ★★★ */}
                <div className="space-y-3">
                  {newSteps.map((step, index) => (
                    <div key={step.id}
                      className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      {/* Step Header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-zinc-50 to-white border-b border-zinc-100">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                            {index + 1}
                          </div>
                          <span className="text-[11px] font-bold text-zinc-700">Bước {index + 1}</span>
                          {step.delay_seconds > 0 && (
                            <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" /> {step.delay_seconds}s
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Move up/down */}
                          <button onClick={() => moveStep(index, -1)} disabled={index === 0}
                            className="p-1 rounded text-zinc-300 hover:text-zinc-600 disabled:opacity-30 transition-colors">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => moveStep(index, 1)} disabled={index === newSteps.length - 1}
                            className="p-1 rounded text-zinc-300 hover:text-zinc-600 disabled:opacity-30 transition-colors">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          {/* Delete step */}
                          {newSteps.length > 1 && (
                            <button onClick={() => removeStep(step.id)}
                              className="p-1 rounded text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Step Body */}
                      <div className="p-4 space-y-3">
                        {/* Text input */}
                        <textarea
                          value={step.text}
                          onChange={(e) => updateStep(step.id, "text", e.target.value)}
                          rows={2}
                          placeholder={`Nội dung tin nhắn bước ${index + 1}...`}
                          className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 resize-none leading-relaxed"
                        />

                        {/* Media preview + upload */}
                        <div className="flex items-start gap-2 flex-wrap">
                          {/* Existing media */}
                          {step.media_urls.map((url, mi) => (
                            <div key={mi} className="relative group">
                              {isVideoUrl(url) ? (
                                <video src={url} className="w-20 h-16 object-cover rounded-lg border border-zinc-200" muted />
                              ) : (
                                <img src={url} alt="" className="w-20 h-16 object-cover rounded-lg border border-zinc-200" />
                              )}
                              <button onClick={() => removeStepMedia(step.id, mi)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}

                          {/* Upload button */}
                          <label className="w-20 h-16 flex flex-col items-center justify-center bg-zinc-50 hover:bg-zinc-100 border-2 border-dashed border-zinc-300 hover:border-blue-400 rounded-lg cursor-pointer transition-all">
                            {uploadingStepId === step.id ? (
                              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                                <span className="text-[8px] text-zinc-400 mt-0.5">Upload</span>
                              </>
                            )}
                            <input
                              ref={(el) => { fileInputRefs.current[step.id] = el; }}
                              type="file" accept="image/*,video/*"
                              onChange={(e) => handleStepFileChange(step.id, e)}
                              className="hidden"
                            />
                          </label>

                          {/* ★ Thư viện button */}
                          <button
                            type="button"
                            onClick={() => openLibrary(step.id, 'new')}
                            className="w-20 h-16 flex flex-col items-center justify-center bg-violet-50 hover:bg-violet-100 border-2 border-dashed border-violet-300 hover:border-violet-500 rounded-lg cursor-pointer transition-all">
                            <Image className="w-3.5 h-3.5 text-violet-400" />
                            <span className="text-[8px] text-violet-500 mt-0.5">Thư viện</span>
                          </button>
                        </div>

                        {/* Delay slider */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                            <Clock className="w-3 h-3" />
                            <span className="font-semibold">Delay:</span>
                          </div>
                          <input
                            type="range"
                            min={0} max={15} step={1}
                            value={step.delay_seconds}
                            onChange={(e) => updateStep(step.id, "delay_seconds", Number(e.target.value))}
                            className="flex-1 h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-violet-500"
                          />
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border",
                            step.delay_seconds === 0
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                              : "bg-amber-50 text-amber-600 border-amber-200")}>
                            {formatDelay(step.delay_seconds)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Step Button */}
                <button onClick={addStep}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-violet-200 hover:border-violet-400 rounded-xl text-violet-600 hover:text-violet-700 hover:bg-violet-50 transition-all text-xs font-bold">
                  <Plus className="w-4 h-4" /> Thêm bước tin nhắn
                </button>

                {/* Submit button */}
                <button onClick={handleAddRule} disabled={adding}
                  className={cn("flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-sm",
                    adding ? "bg-zinc-200 text-zinc-500 cursor-wait" : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white")}>
                  {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  {adding ? "Đang tạo..." : `Tạo kịch bản (${newSteps.filter(s => s.text.trim() || s.media_urls.length > 0).length} bước)`}
                </button>
              </div>

              {/* Info */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2">
                <Zap className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-700 leading-relaxed">
                  <strong>Ưu tiên:</strong> Khi khách nhắn tin → Hệ thống check <strong>Từ khóa trước</strong>. Nếu trúng → Gửi tuần tự các bước (có delay tự nhiên). Nếu không → Gọi <strong>Gemini AI</strong>.
                  <br /><strong>Delay:</strong> Mỗi bước có thể chờ 0-15 giây trước khi gửi. Bot sẽ hiện &quot;đang nhập...&quot; trong lúc chờ.
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Xóa kịch bản?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600">Kịch bản từ khóa này sẽ bị xóa vĩnh viễn. Bot sẽ không còn tự trả lời cho từ khóa này nữa.</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setDeleteId(null)}
              className="flex-1 py-2 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all">Hủy</button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1">
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              {deleting ? "Đang xóa..." : "Xóa kịch bản"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════ */}
      {/* EDIT RULE DIALOG                           */}
      {/* ═══════════════════════════════════════════ */}
      <Dialog open={!!editRule} onOpenChange={() => setEditRule(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="w-5 h-5 text-blue-500" /> Chỉnh sửa kịch bản
            </DialogTitle>
          </DialogHeader>

          {editRule && (
            <div className="space-y-5 mt-2">
              {/* Keywords */}
              <div>
                <label className="text-xs font-bold text-zinc-600 mb-1.5 block">Từ khóa (phân cách bằng dấu phẩy)</label>
                <input value={editRule.keywords} onChange={(e) => setEditRule(prev => ({ ...prev, keywords: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                  placeholder="vd: xin chào, hello, hi" />
              </div>

              {/* Match Type */}
              <div>
                <label className="text-xs font-bold text-zinc-600 mb-1.5 block">Kiểu so khớp</label>
                <div className="flex gap-2">
                  {[
                    { v: 'contains', label: 'Chứa từ khóa', icon: '🔍' },
                    { v: 'exact', label: 'Khớp chính xác', icon: '🎯' },
                    { v: 'startswith', label: 'Bắt đầu bằng', icon: '▶️' },
                  ].map(opt => (
                    <button key={opt.v} onClick={() => setEditRule(prev => ({ ...prev, match_type: opt.v }))}
                      className={cn("flex-1 py-2 text-xs font-semibold rounded-xl border transition-all",
                        editRule.match_type === opt.v 
                          ? "bg-blue-50 border-blue-300 text-blue-700" 
                          : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100")}>
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Page assignment */}
              <div>
                <label className="text-xs font-bold text-zinc-600 mb-1.5 block">Áp dụng cho Page</label>
                <select
                  value={editRule.integration_id || ''}
                  onChange={(e) => setEditRule(prev => ({ ...prev, integration_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                >
                  <option value="">🌐 Chung (Tất cả Pages)</option>
                  {pages.map(p => (
                    <option key={p.id} value={p.id}>📄 {p.page_name || p.page_id}</option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-400 mt-1">Chọn &quot;Chung&quot; nếu muốn kịch bản áp dụng cho mọi Page.</p>
              </div>

              {/* Steps Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-zinc-600">Các bước tin nhắn</label>
                  <button onClick={addEditStep}
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 px-2 py-1 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-all">
                    <Plus className="w-3 h-3" /> Thêm bước
                  </button>
                </div>

                <div className="space-y-3">
                  {editRule.steps.map((step, idx) => (
                    <div key={step.id} className="bg-zinc-50 rounded-xl border border-zinc-200 p-4">
                      <div className="flex items-start gap-3">
                        {/* Step number + move */}
                        <div className="flex flex-col items-center gap-1 pt-1">
                          <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[10px] font-bold">
                            {idx + 1}
                          </div>
                          {editRule.steps.length > 1 && (
                            <>
                              <button onClick={() => moveEditStep(idx, -1)} disabled={idx === 0}
                                className="p-0.5 text-zinc-400 hover:text-zinc-600 disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                              <button onClick={() => moveEditStep(idx, 1)} disabled={idx === editRule.steps.length - 1}
                                className="p-0.5 text-zinc-400 hover:text-zinc-600 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                            </>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 space-y-2">
                          <textarea value={step.text} onChange={(e) => updateEditStep(step.id, 'text', e.target.value)}
                            rows={2} placeholder="Nội dung tin nhắn..."
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 resize-none" />

                          {/* Media */}
                          <div className="flex flex-wrap gap-2">
                            {step.media_urls.map((url, mi) => (
                              <div key={mi} className="relative group">
                                {isVideoUrl(url) ? (
                                  <video src={url} className="w-16 h-16 rounded-lg object-cover border border-zinc-200" muted playsInline />
                                ) : (
                                  <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-zinc-200" />
                                )}
                                <button onClick={() => removeEditStepMedia(step.id, mi)}
                                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Actions row */}
                          <div className="flex items-center gap-3">
                            {/* Upload */}
                            <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden"
                              ref={el => { editFileRefs.current[step.id] = el; }}
                              onChange={(e) => handleEditStepUpload(step.id, e)} />
                            <button onClick={() => editFileRefs.current[step.id]?.click()}
                              disabled={editUploadingStepId === step.id}
                              className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 hover:text-blue-600 px-2 py-1 bg-white rounded-lg border border-zinc-200 hover:border-blue-200 transition-all">
                              {editUploadingStepId === step.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                              Upload
                            </button>
                            {/* ★ Chọn từ Thư viện */}
                            <button type="button" onClick={() => openLibrary(step.id, 'edit')}
                              className="flex items-center gap-1 text-[10px] font-semibold text-violet-500 hover:text-violet-700 px-2 py-1 bg-violet-50 rounded-lg border border-violet-200 hover:border-violet-400 transition-all">
                              <Image className="w-3 h-3" />
                              Thư viện
                            </button>

                            {/* Delay */}
                            {idx > 0 && (
                              <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                                <Clock className="w-3 h-3" />
                                <input type="number" min={0} max={15} value={step.delay_seconds}
                                  onChange={(e) => updateEditStep(step.id, 'delay_seconds', Math.min(15, Math.max(0, Number(e.target.value))))}
                                  className="w-12 px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-center text-[10px] outline-none" />
                                <span>giây</span>
                              </div>
                            )}

                            {/* Remove step */}
                            {editRule.steps.length > 1 && (
                              <button onClick={() => removeEditStep(step.id)}
                                className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-red-400 hover:text-red-600 px-2 py-1 bg-white rounded-lg border border-zinc-200 hover:border-red-200 transition-all">
                                <Trash2 className="w-3 h-3" /> Xóa bước
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditRule(null)}
                  className="flex-1 py-2.5 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all">Hủy</button>
                <button onClick={handleSaveEdit} disabled={editSaving}
                  className={cn("flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1",
                    editSaving ? "bg-zinc-200 text-zinc-500 cursor-wait" : "bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700")}>
                  {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  {editSaving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ★★★ MEDIA LIBRARY MODAL ★★★ */}
      <Dialog open={showLibrary} onOpenChange={(o) => { if (!o) setShowLibrary(false); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="w-4 h-4 text-violet-500" /> Thư viện Media
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-zinc-500 -mt-1">
            Chọn ảnh hoặc video đã upload để dùng lại, hoặc upload file mới.
          </div>

          {/* Upload mới */}
          <label className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 border-2 border-dashed border-blue-300 rounded-xl cursor-pointer transition-all text-xs font-semibold text-blue-600">
            <Upload className="w-4 h-4" />
            Upload ảnh / video mới vào thư viện
            <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const token = localStorage.getItem('token');
                const fd = new FormData();
                fd.append('file', file);
                setLibraryLoading(true);
                try {
                  const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
                  const data = await res.json();
                  if (res.ok) {
                    setLibraryItems(prev => [{ id: Date.now(), url: data.url, mimetype: data.mimetype, filename: data.filename, size: data.size, created_at: new Date().toISOString() }, ...prev]);
                    toast({ title: '✅ Đã upload vào thư viện', description: file.name });
                  }
                } catch { }
                finally { setLibraryLoading(false); e.target.value = ''; }
              }} />
          </label>

          {/* Grid */}
          <ScrollArea className="flex-1">
            {libraryLoading ? (
              <div className="flex items-center justify-center py-12 text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang tải thư viện...
              </div>
            ) : libraryItems.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">
                Chưa có file nào. Upload file đầu tiên!
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3 p-1">
                {libraryItems.map(item => (
                  <div key={item.id} className="relative group cursor-pointer rounded-xl overflow-hidden border-2 border-transparent hover:border-violet-400 transition-all"
                    onClick={() => pickFromLibrary(item.url)}>
                    {isVideoUrl(item.url) || item.mimetype?.startsWith('video/') ? (
                      <video src={item.url} className="w-full h-28 object-cover bg-zinc-100" muted />
                    ) : (
                      <img src={item.url} alt={item.filename} className="w-full h-28 object-cover bg-zinc-100" />
                    )}
                    <div className="absolute inset-0 bg-violet-500/0 group-hover:bg-violet-500/20 transition-all flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-all drop-shadow-lg" />
                    </div>
                    <div className="absolute top-1 left-1">
                      {(isVideoUrl(item.url) || item.mimetype?.startsWith('video/')) ? (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 bg-black/60 text-white rounded">VIDEO</span>
                      ) : (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 bg-black/40 text-white rounded">IMG</span>
                      )}
                    </div>
                    <button type="button"
                      onClick={(ev) => { ev.stopPropagation(); deleteLibraryItem(item.id); }}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                      <p className="text-[8px] text-white truncate">{item.filename}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

