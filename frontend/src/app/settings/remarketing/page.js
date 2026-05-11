"use client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import {
  MessageCircle, Clock, Save, Loader2, Plus, Trash2,
  Zap, Info, CheckCircle2, Bell, RefreshCw, AlertTriangle,
  ChevronDown, ChevronUp, ExternalLink, Shield
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function authFetch(url, options = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
}

const DELAY_OPTIONS = [
  { value: 5, label: "5 phút" }, { value: 10, label: "10 phút" },
  { value: 15, label: "15 phút" }, { value: 20, label: "20 phút" },
  { value: 30, label: "30 phút" }, { value: 60, label: "1 giờ" },
];

const TAG_OPTIONS = [
  { value: "CONFIRMED_EVENT_UPDATE", label: "Nhắc sự kiện / lịch hẹn", desc: "Phổ biến nhất, dùng cho remind order/hẹn tư vấn" },
  { value: "POST_PURCHASE_UPDATE", label: "Cập nhật sau mua hàng", desc: "Dùng cho thông tin đơn hàng, vận chuyển" },
  { value: "ACCOUNT_UPDATE", label: "Cập nhật tài khoản", desc: "Thông báo liên quan tài khoản khách hàng" },
];

const SAMPLE_PHASE1 = [
  "Bạn ơi, shop chưa thấy bạn phản hồi ạ 😊 Bạn còn quan tâm đến sản phẩm không?",
  "Dạ bạn ơi, không biết bạn đang bận không ạ? Shop luôn sẵn sàng hỗ trợ bạn nhé! 🙏",
];

const SAMPLE_PHASE2 = [
  "Chào bạn! Shop có chương trình ưu đãi mới hôm nay, bạn có muốn xem không ạ? 🎁",
  "Bạn ơi, sản phẩm bạn hỏi hôm trước vẫn còn hàng đấy ạ! Để shop tư vấn thêm nhé 😊",
  "Hôm nay shop đang freeship toàn quốc, bạn tranh thủ đặt hàng luôn nhé! 🚀",
  "Bạn có cần shop gửi thêm hình ảnh chi tiết sản phẩm không ạ? 📸",
];

export default function RemarketingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showFbGuide, setShowFbGuide] = useState(false);
  const [settings, setSettings] = useState({
    // Phase 1
    enabled: false, delay_minutes: 10, message: "",
    // Phase 2
    remarketing_enabled: false, remarketing_interval_min: 12, remarketing_interval_max: 23,
    remarketing_templates: [""],
    remarketing_max_cycles: 30, remarketing_max_days: 30,
    remarketing_message_tag: "CONFIRMED_EVENT_UPDATE",
  });

  const fetchSettings = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/followup/settings`);
      const data = await res.json();
      setSettings({
        enabled: data.enabled || false,
        delay_minutes: data.delay_minutes || 10,
        message: data.message || "",
        remarketing_enabled: data.remarketing_enabled || false,
        remarketing_interval_min: data.remarketing_interval_min || 12,
        remarketing_interval_max: data.remarketing_interval_max || 23,
        remarketing_templates: data.remarketing_templates?.length ? data.remarketing_templates : [""],
        remarketing_max_cycles: data.remarketing_max_cycles || 30,
        remarketing_max_days: data.remarketing_max_days || 30,
        remarketing_message_tag: data.remarketing_message_tag || "CONFIRMED_EVENT_UPDATE",
      });
    } catch (err) {
      toast({ title: "❌ Lỗi tải cài đặt", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- authFetch/toast are stable module-level refs

  // FIX: fetchSettings in deps array — satisfies react-hooks/exhaustive-deps
  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    if (settings.enabled && settings.message.trim().length < 5) {
      toast({ title: "⚠️ Phase 1: Thiếu nội dung tin nhắn hỏi lại", variant: "destructive" });
      return;
    }
    if (settings.remarketing_interval_min >= settings.remarketing_interval_max) {
      toast({ title: "⚠️ Giờ tối thiểu phải nhỏ hơn tối đa", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const cleanTemplates = settings.remarketing_templates.filter(t => t.trim().length >= 5);
      const res = await authFetch(`${API_BASE}/api/followup/settings`, {
        method: "PUT",
        body: JSON.stringify({ ...settings, remarketing_templates: cleanTemplates }),
      });
      const data = await res.json();
      if (res.ok) toast({ title: "✅ Đã lưu cài đặt Remarketing" });
      else toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Template helpers
  const addTemplate = () => setSettings(s => ({ ...s, remarketing_templates: [...s.remarketing_templates, ""] }));
  const removeTemplate = (i) => setSettings(s => ({ ...s, remarketing_templates: s.remarketing_templates.filter((_, idx) => idx !== i) }));
  const updateTemplate = (i, val) => setSettings(s => ({
    ...s, remarketing_templates: s.remarketing_templates.map((t, idx) => idx === i ? val : t)
  }));
  const applySampleP2 = (msg) => setSettings(s => ({
    ...s, remarketing_templates: [...s.remarketing_templates.filter(t => t.trim()), msg]
  }));

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-zinc-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang tải...
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Remarketing tự động</h1>
          <p className="text-xs text-zinc-500">Giữ tương tác với khách chưa phản hồi, tự động gửi đến khi họ reply</p>
        </div>
      </div>

      {/* Flow diagram */}
      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-violet-700 mb-3 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Flow hoạt động</p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {[
            { icon: MessageCircle, label: "Bot reply", color: "violet" },
            { label: "→" },
            { icon: Clock, label: "Chờ X phút", color: "blue" },
            { label: "→" },
            { icon: Bell, label: "Hỏi lại lần 1", color: "indigo" },
            { label: "→" },
            { icon: RefreshCw, label: "Cứ 12–23h gửi tiếp", color: "purple" },
            { label: "→" },
            { icon: CheckCircle2, label: "Khách reply → AI tư vấn", color: "emerald" },
          ].map((step, i) => {
            if (step.label === "→") return <span key={i} className="text-zinc-400 font-bold">→</span>;
            const Icon = step.icon;
            return (
              <div key={i} className={`flex items-center gap-1 bg-white rounded-xl px-2.5 py-1.5 border border-${step.color}-200 text-${step.color}-700`}>
                <Icon className="w-3 h-3" />{step.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ PHASE 1 ═══ */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-white/30 text-white text-[10px] font-black flex items-center justify-center">1</span>
          <p className="font-semibold text-white text-sm">Follow-up lần đầu</p>
          <div className="ml-auto">
            <button onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.enabled ? "bg-white/40" : "bg-black/20"}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>
        <div className={`p-5 space-y-4 transition-all ${settings.enabled ? "" : "opacity-50 pointer-events-none"}`}>
          {/* Delay */}
          <div>
            <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-500" /> Thời gian chờ trước khi hỏi lại
            </label>
            <div className="flex flex-wrap gap-2">
              {DELAY_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setSettings(s => ({ ...s, delay_minutes: opt.value }))}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${settings.delay_minutes === opt.value
                    ? "bg-blue-500 text-white border-blue-500 shadow" : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-blue-300"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* Message */}
          <div>
            <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2 mb-1">
              <MessageCircle className="w-4 h-4 text-blue-500" /> Nội dung tin hỏi lại
            </label>
            <textarea value={settings.message} onChange={e => setSettings(s => ({ ...s, message: e.target.value }))}
              rows={3} placeholder="VD: Bạn ơi, shop chưa thấy bạn phản hồi ạ 😊..."
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 resize-none" />
            <div className="flex gap-2 mt-2 flex-wrap">
              {SAMPLE_PHASE1.map((msg, i) => (
                <button key={i} onClick={() => setSettings(s => ({ ...s, message: msg }))}
                  className="text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-2 py-1 transition-all">
                  Mẫu {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PHASE 2 ═══ */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-white/30 text-white text-[10px] font-black flex items-center justify-center">2</span>
          <p className="font-semibold text-white text-sm">Vòng lặp Remarketing</p>
          <div className="ml-auto">
            <button onClick={() => setSettings(s => ({ ...s, remarketing_enabled: !s.remarketing_enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.remarketing_enabled ? "bg-white/40" : "bg-black/20"}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.remarketing_enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        <div className={`p-5 space-y-5 transition-all ${settings.remarketing_enabled ? "" : "opacity-50 pointer-events-none"}`}>
          {/* Interval */}
          <div>
            <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-violet-500" /> Gửi lại sau mỗi (giờ ngẫu nhiên)
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-400 mb-1 block">Tối thiểu (giờ)</label>
                <input type="number" min={1} max={167} value={settings.remarketing_interval_min}
                  onChange={e => setSettings(s => ({ ...s, remarketing_interval_min: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-center font-bold outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300" />
              </div>
              <span className="text-zinc-400 font-bold mt-4">–</span>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-400 mb-1 block">Tối đa (giờ)</label>
                <input type="number" min={2} max={168} value={settings.remarketing_interval_max}
                  onChange={e => setSettings(s => ({ ...s, remarketing_interval_max: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-center font-bold outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300" />
              </div>
              <div className="mt-4 text-xs text-zinc-500 whitespace-nowrap">
                ≈ {settings.remarketing_interval_min}–{settings.remarketing_interval_max}h mỗi lần
              </div>
            </div>
          </div>

          {/* Limits */}
          <div>
            <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-violet-500" /> Giới hạn gửi
            </label>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-400 mb-1 block">Tối đa số lần</label>
                <input type="number" min={1} max={100} value={settings.remarketing_max_cycles}
                  onChange={e => setSettings(s => ({ ...s, remarketing_max_cycles: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-center font-bold outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-400 mb-1 block">Trong vòng (ngày)</label>
                <input type="number" min={1} max={365} value={settings.remarketing_max_days}
                  onChange={e => setSettings(s => ({ ...s, remarketing_max_days: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-center font-bold outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300" />
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1.5">
              Hệ thống sẽ dừng gửi sau <span className="font-bold text-violet-600">{settings.remarketing_max_cycles} lần</span> hoặc sau <span className="font-bold text-violet-600">{settings.remarketing_max_days} ngày</span> tính từ lần hỏi lại đầu tiên.
            </p>
          </div>

          {/* Message Tag */}
          <div>
            <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-violet-500" /> Facebook Message Tag
              <button onClick={() => setShowFbGuide(!showFbGuide)} className="ml-auto text-[10px] text-violet-600 hover:underline flex items-center gap-1">
                <Info className="w-3 h-3" /> Subscription Messaging?
              </button>
            </label>
            <div className="space-y-2">
              {TAG_OPTIONS.map(tag => (
                <button key={tag.value} onClick={() => setSettings(s => ({ ...s, remarketing_message_tag: tag.value }))}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${settings.remarketing_message_tag === tag.value
                    ? "border-violet-400 bg-violet-50" : "border-zinc-200 bg-zinc-50 hover:border-violet-200"}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${settings.remarketing_message_tag === tag.value ? "border-violet-500 bg-violet-500" : "border-zinc-300"}`} />
                    <div>
                      <p className="text-sm font-semibold text-zinc-800">{tag.label}</p>
                      <p className="text-[10px] text-zinc-400">{tag.desc}</p>
                    </div>
                    <code className="ml-auto text-[9px] bg-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded font-mono">{tag.value}</code>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Templates */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-violet-500" /> Pool tin nhắn xoay vòng
              </label>
              <span className="ml-auto text-[10px] text-zinc-400">{settings.remarketing_templates.filter(t => t.trim()).length} mẫu</span>
            </div>
            <p className="text-[10px] text-zinc-400 mb-3">Bot sẽ gửi lần lượt: Mẫu 1 → 2 → 3 → ... → quay lại Mẫu 1</p>
            <div className="space-y-2">
              {settings.remarketing_templates.map((msg, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="w-6 h-6 rounded-lg bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-2">{i + 1}</div>
                  <textarea value={msg} onChange={e => updateTemplate(i, e.target.value)}
                    rows={2} placeholder={`Tin nhắn mẫu ${i + 1}...`}
                    className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 resize-none" />
                  {settings.remarketing_templates.length > 1 && (
                    <button onClick={() => removeTemplate(i)} className="mt-2 p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={addTemplate} className="flex items-center gap-1.5 text-xs text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl px-3 py-2 transition-all font-semibold">
                <Plus className="w-3.5 h-3.5" /> Thêm mẫu
              </button>
              {SAMPLE_PHASE2.map((msg, i) => (
                <button key={i} onClick={() => applySampleP2(msg)} className="text-[10px] text-zinc-500 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg px-2 py-1 transition-all">
                  + Gợi ý {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Facebook Subscription Guide */}
      {showFbGuide && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="font-bold text-amber-800 text-sm">Hướng dẫn: Subscription Messaging</p>
          </div>
          <div className="space-y-3 text-xs text-amber-900">
            <div className="bg-white rounded-xl p-3 border border-amber-200">
              <p className="font-bold mb-1">⚠️ Tại sao cần điều này?</p>
              <p>Facebook chỉ cho phép gửi tin tự động ngoài cửa sổ 24h nếu dùng <strong>Message Tag hợp lệ</strong> hoặc có quyền <strong>Subscription Messaging</strong>.</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-amber-200">
              <p className="font-bold mb-2">📋 Cách đăng ký Subscription Messaging:</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>Vào <strong>developers.facebook.com</strong> → chọn App của bạn</li>
                <li>Vào <strong>App Review → Permissions and Features</strong></li>
                <li>Tìm <strong>&quot;pages_messaging_subscriptions&quot;</strong> → Request</li>
                <li>Điền use case: <em>&quot;Send follow-up messages to customers who initiated conversation&quot;</em></li>
                <li>Chờ Facebook review (thường 1–5 ngày làm việc)</li>
              </ol>
            </div>
            <div className="bg-white rounded-xl p-3 border border-amber-200">
              <p className="font-bold mb-1">💡 Mẹo hiện tại (chưa có Subscription):</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Dùng tag <code className="bg-amber-100 px-1 rounded">CONFIRMED_EVENT_UPDATE</code> cho tin nhắn dạng nhắc hẹn/đơn hàng</li>
                <li>Đặt interval ngắn hơn (8–16h) để bắt kịp cửa sổ 24h</li>
                <li>Nếu tin bị từ chối, bot sẽ log lỗi nhưng không crash</li>
              </ul>
            </div>
            <a href="https://developers.facebook.com/docs/messenger-platform/send-messages/message-tags" target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-amber-700 font-semibold hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Facebook Message Tags Documentation
            </a>
          </div>
        </div>
      )}

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white font-semibold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Đang lưu..." : "Lưu cài đặt Remarketing"}
      </button>
    </div>
  );
}
