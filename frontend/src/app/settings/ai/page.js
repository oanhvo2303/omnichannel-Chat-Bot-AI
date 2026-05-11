"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles, Key, Gauge, Loader2, Save, CheckCircle2,
  XCircle, ExternalLink, Zap, Shield, Eye, EyeOff, TestTube2, Infinity
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const authFetch = async (url, opts = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers } });
};

export default function AISettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  // resetting removed — reset quota là hành động billing, không để tenant tự làm

  // Form state
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [quotaLimit, setQuotaLimit] = useState(1000);
  const [quotaEnabled, setQuotaEnabled] = useState(true);
  const [messagesUsed, setMessagesUsed] = useState(0);

  // Test result
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/settings/ai`);
      if (res.ok) {
        const data = await res.json();
        setApiKey(data.gemini_api_key_masked || "");
        setHasKey(data.has_key);
        const limit = data.ai_quota_limit;
        if (limit <= 0) {
          setQuotaEnabled(false);
          setQuotaLimit(1000); // default khi bật lại
        } else {
          setQuotaEnabled(true);
          setQuotaLimit(limit);
        }
        setMessagesUsed(data.ai_messages_used || 0);
      }
    } catch (err) {
      console.error("Load AI settings failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Fix: khi TẮT giới hạn → gửi 999999 (backend accept) thay vì -1 (backend reject)
      const limitToSend = quotaEnabled ? Math.max(1, quotaLimit) : 999999;
      const res = await authFetch(`${API_BASE}/api/settings/ai`, {
        method: "PATCH",
        body: JSON.stringify({
          gemini_api_key: apiKey,
          ai_quota_limit: limitToSend,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "✅ Đã lưu cấu hình AI", description: "API Key và Quota đã được cập nhật." });
        setHasKey(true);
        fetchSettings(); // reload masked key
      } else {
        toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi kết nối", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch(`${API_BASE}/api/settings/ai/test`, {
        method: "POST",
        body: JSON.stringify({ gemini_api_key: apiKey }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast({ title: "✅ API Key hoạt động!", description: `Gemini phản hồi sau ${data.latency_ms}ms.` });
      } else {
        toast({ title: "❌ API Key không hợp lệ", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const quotaPercent = quotaLimit > 0 ? Math.min(100, Math.round((messagesUsed / quotaLimit) * 100)) : 0;
  const quotaColor = quotaPercent < 60 ? "bg-emerald-500" : quotaPercent < 85 ? "bg-amber-500" : "bg-red-500";

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Cài đặt AI</h1>
              <p className="text-xs text-zinc-500">Cấu hình Gemini API Key, Quota sử dụng AI</p>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]",
              saving ? "bg-zinc-300 text-zinc-500 cursor-wait" : "bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
            )}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-8 py-6 space-y-6">

          {/* ═══ API Key Card ═══ */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold text-zinc-800">Gemini API Key</h2>
                {hasKey ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Đã cấu hình
                  </span>
                ) : (
                  <span className="text-[9px] font-bold px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-200 flex items-center gap-1">
                    <XCircle className="w-2.5 h-2.5" /> Chưa cấu hình
                  </span>
                )}
              </div>
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                <ExternalLink className="w-3 h-3" /> Lấy API Key
              </a>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Nhập API Key từ <strong>Google AI Studio</strong> để AI chatbot hoạt động. Mỗi shop sử dụng API Key riêng, đảm bảo bảo mật và kiểm soát chi phí.
              </p>

              {/* API Key Input */}
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy... (dán API Key tại đây)"
                  className="w-full px-4 py-3 pr-20 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
                />
                <button onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all">
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Test Button + Result */}
              <div className="flex items-center gap-3">
                <button onClick={handleTest} disabled={testing || !apiKey}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all",
                    testing || !apiKey
                      ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                  )}>
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                  {testing ? "Đang test..." : "Test API Key"}
                </button>

                {testResult && (
                  <div className={cn(
                    "flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-lg",
                    testResult.success
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-red-50 text-red-600 border border-red-200"
                  )}>
                    {testResult.success ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>✅ Hoạt động — {testResult.latency_ms}ms — "{testResult.response?.substring(0, 30)}..."</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3" />
                        <span>{testResult.error}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Security Note */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <Shield className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  <strong>Bảo mật:</strong> API Key được mã hóa và lưu riêng cho shop của bạn. Không ai (kể cả admin nền tảng) có thể xem toàn bộ key. Google AI Studio cung cấp free tier 60 requests/phút.
                </p>
              </div>
            </div>
          </div>

          {/* ═══ Quota Card ═══ */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-bold text-zinc-800">Giới hạn Quota AI</h2>
                {!quotaEnabled && (
                  <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 flex items-center gap-1">
                    <Infinity className="w-3 h-3" /> Không giới hạn
                  </span>
                )}
              </div>
              {/* Switch ON/OFF */}
              <label className="relative inline-flex items-center cursor-pointer gap-2">
                <span className={cn("text-[10px] font-bold", quotaEnabled ? "text-blue-600" : "text-zinc-400")}>
                  {quotaEnabled ? 'BẬT giới hạn' : 'TẮT giới hạn'}
                </span>
                <input type="checkbox" className="sr-only peer" checked={quotaEnabled}
                  onChange={(e) => setQuotaEnabled(e.target.checked)} />
                <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[18px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
              </label>
            </div>
            <div className="p-6 space-y-5">

              {quotaEnabled ? (
                <>
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-600">Đã sử dụng</span>
                      <span className="text-xs font-bold text-zinc-800">
                        {messagesUsed.toLocaleString()} / {quotaLimit.toLocaleString()} tin nhắn
                      </span>
                    </div>
                    <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", quotaColor)}
                        style={{ width: `${quotaPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border",
                        quotaPercent < 60 ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                        quotaPercent < 85 ? "bg-amber-50 text-amber-600 border-amber-200" :
                        "bg-red-50 text-red-600 border-red-200"
                      )}>
                        {quotaPercent}% đã dùng
                      </span>
                      <span className="text-[10px] text-zinc-400">Còn lại: {(quotaLimit - messagesUsed).toLocaleString()} tin</span>
                    </div>
                  </div>

                  {/* Quota Limit Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-600">Giới hạn Quota (tin nhắn/kỳ)</label>
                    <input
                      type="number"
                      value={quotaLimit}
                      onChange={(e) => setQuotaLimit(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                    />
                  </div>

                  {/* Info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                    <Zap className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-700 leading-relaxed">
                      <strong>Quota</strong> đếm số tin nhắn mà AI đã xử lý trong kỳ. Khi hết quota, chatbot sẽ chờ sale trả lời. Để tăng quota, liên hệ admin nền tảng.
                    </p>
                  </div>
                </>
              ) : (
                /* Unlimited mode */
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
                    <Infinity className="w-7 h-7 text-emerald-500" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-800">Đang tắt giới hạn</h3>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                    AI chatbot sẽ trả lời <strong>không giới hạn</strong> số tin nhắn. Lưu ý chi phí API sẽ phụ thuộc vào Google AI quota của bạn.
                  </p>
                  <span className="mt-3 text-[10px] font-semibold text-zinc-400">Đã xử lý: {messagesUsed.toLocaleString()} tin nhắn</span>
                </div>
              )}

            </div>
          </div>

          {/* ═══ Guide Card ═══ */}
          <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl border border-violet-200 p-6">
            <h3 className="text-sm font-bold text-violet-800 mb-3">📘 Hướng dẫn lấy API Key</h3>
            <ol className="space-y-2 text-[11px] text-violet-700 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-200 text-violet-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                <span>Truy cập <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-bold underline">Google AI Studio</a> → Đăng nhập bằng tài khoản Google.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-200 text-violet-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                <span>Nhấn <strong>"Create API Key"</strong> → Chọn project (hoặc tạo mới) → Copy key.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-200 text-violet-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                <span>Dán key vào ô phía trên → Nhấn <strong>"Test API Key"</strong> để kiểm tra → <strong>"Lưu thay đổi"</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-200 text-violet-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">4</span>
                <span><strong>Free tier:</strong> 60 request/phút, 1 triệu token/ngày. Đủ cho hầu hết shop nhỏ-vừa.</span>
              </li>
            </ol>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
