"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, Save, Eye, EyeOff, TestTube2, CheckCircle2,
  AlertTriangle, ExternalLink, Copy, BarChart3, Zap
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const authFetch = async (url, options = {}) => {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Chưa đăng nhập");
  const headers = { ...options.headers, Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Phiên đăng nhập hết hạn");
  }
  return res;
};

export default function TrackingSettingsPage() {
  const [config, setConfig] = useState({
    pixel_id: "",
    capi_token: "",
    test_event_code: "",
    is_active: false,
  });
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/tracking`);
        const data = await res.json();
        setConfig((prev) => ({ ...prev, ...data }));
      } catch (err) {
        toast({ title: "❌ Lỗi", description: "Không tải được cấu hình tracking.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config.pixel_id.trim() || !config.capi_token.trim()) {
      toast({ title: "❌ Thiếu thông tin", description: "Vui lòng điền Pixel ID và CAPI Access Token.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/api/tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, is_active: true }), // Lưu luôn bật
      });
      if (res.ok) {
        setConfig((prev) => ({ ...prev, is_active: true }));
        toast({ title: "✅ Đã lưu cấu hình", description: "Hệ thống đã bắt đầu gửi sự kiện CAPI." });
      } else {
        const err = await res.json();
        toast({ title: "❌ Lỗi", description: err.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi kết nối", description: "Không lưu được cấu hình.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEvent = async () => {
    if (!config.pixel_id.trim() || !config.capi_token.trim()) {
      toast({ title: "❌ Cần cấu hình trước", description: "Điền Pixel ID và Token trước khi test.", variant: "destructive" });
      return;
    }
    setTestResult("loading");
    try {
      const res = await authFetch(`${API_BASE}/api/tracking/test`, { method: "POST" });
      if (res.ok) {
        setTestResult("success");
        toast({ title: "🧪 Test Event thành công!", description: "Sự kiện được gửi tới Facebook Events Manager." });
        setTimeout(() => setTestResult(null), 5000);
      } else {
        const err = await res.json();
        setTestResult("error");
        toast({ title: "❌ Lỗi Facebook API", description: err.error, variant: "destructive" });
      }
    } catch (err) {
      setTestResult("error");
      toast({ title: "❌ Lỗi kết nối", description: "Không thể gọi Test API.", variant: "destructive" });
    }
  };

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    toast({ title: "📋 Đã copy " + label });
  };

  const maskedToken = config.capi_token
    ? config.capi_token.slice(0, 10) + "•".repeat(20) + config.capi_token.slice(-6)
    : "";

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Pixel & Tracking</h1>
              <p className="text-xs text-zinc-500">Cấu hình Facebook Pixel và Conversions API (CAPI)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config.is_active && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Đang hoạt động
              </span>
            )}
            <button onClick={handleSave} disabled={isSaving}
              className={cn("flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]",
                isSaving ? "bg-zinc-400 cursor-wait" : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700")}>
              <Save className="w-4 h-4" /> {isSaving ? "Đang lưu..." : "Lưu cấu hình"}
            </button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-8 py-6 space-y-5">

          {/* Facebook Pixel Config Card */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-bold text-zinc-800">Facebook Pixel ID</h2>
            </div>
            <div className="p-6">
              <p className="text-xs text-zinc-500 mb-3">
                Pixel ID dùng để theo dõi hành vi người dùng trên website. Lấy từ{" "}
                <a href="https://business.facebook.com/events_manager2" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
                  Facebook Events Manager <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </p>
              <div className="relative">
                <input
                  value={config.pixel_id}
                  onChange={(e) => setConfig({ ...config, pixel_id: e.target.value })}
                  placeholder="VD: 1234567890123456"
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                />
                {config.pixel_id && (
                  <button onClick={() => handleCopy(config.pixel_id, "Pixel ID")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* CAPI Access Token Card */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-500" />
              <h2 className="text-sm font-bold text-zinc-800">Conversions API (CAPI) Access Token</h2>
            </div>
            <div className="p-6">
              <p className="text-xs text-zinc-500 mb-3">
                Token để gửi sự kiện server-side cho Facebook. CAPI giúp tracking chính xác hơn cookie-based Pixel, đặc biệt với iOS 14.5+.
              </p>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={config.capi_token}
                  onChange={(e) => setConfig({ ...config, capi_token: e.target.value })}
                  placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 pr-20 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button onClick={() => setShowToken(!showToken)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors">
                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  {config.capi_token && (
                    <button onClick={() => handleCopy(config.capi_token, "CAPI Token")}
                      className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Token này cực kỳ nhạy cảm. Không chia sẻ cho bất kỳ ai.</span>
              </div>
            </div>
          </div>

          {/* Test Event Code Card */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-2">
              <TestTube2 className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-bold text-zinc-800">Test Event Code</h2>
              <span className="text-[9px] font-bold px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-full border border-zinc-200">Tùy chọn</span>
            </div>
            <div className="p-6">
              <p className="text-xs text-zinc-500 mb-3">
                Mã test để kiểm tra sự kiện trong Events Manager mà không ảnh hưởng đến dữ liệu thật. Lấy từ tab &ldquo;Test Events&rdquo;.
              </p>
              <input
                value={config.test_event_code}
                onChange={(e) => setConfig({ ...config, test_event_code: e.target.value })}
                placeholder="VD: TEST12345"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300"
              />

              {/* Test Button */}
              <div className="mt-4 flex items-center gap-3">
                <button onClick={handleTestEvent}
                  disabled={testResult === "loading"}
                  className={cn("flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all shadow-sm",
                    testResult === "loading"
                      ? "bg-zinc-200 text-zinc-500 cursor-wait"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100")}>
                  <TestTube2 className="w-4 h-4" />
                  {testResult === "loading" ? "Đang gửi..." : "Gửi Test Event"}
                </button>
                {testResult === "success" && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4" /> Thành công! Kiểm tra Events Manager.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Events Tracked Info */}
          <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-2xl p-5">
            <h3 className="text-xs font-bold text-indigo-800 mb-3">📊 Sự kiện được theo dõi tự động</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { event: "PageView", desc: "Xem trang" },
                { event: "Lead", desc: "Khách inbox" },
                { event: "Purchase", desc: "Chốt đơn" },
                { event: "AddToCart", desc: "Thêm giỏ hàng" },
              ].map((e) => (
                <div key={e.event} className="bg-white/70 backdrop-blur-sm rounded-xl p-3 border border-indigo-100">
                  <span className="text-[10px] font-bold text-indigo-600 font-mono">{e.event}</span>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{e.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
