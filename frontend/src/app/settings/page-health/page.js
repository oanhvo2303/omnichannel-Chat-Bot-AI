"use client";
import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Wifi, WifiOff,
  Bot, Users, Webhook, ShieldCheck, MessageCircle,
  Clock, ExternalLink, Loader2, Activity, ChevronDown, ChevronUp,
  Sparkles,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function authFetch(url, opts = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

/* ─── Status Badge ──────────────────────────────────────── */
function StatusBadge({ status }) {
  const cfg = {
    healthy:      { color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Hoạt động tốt" },
    warning:      { color: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500",   label: "Cảnh báo" },
    error:        { color: "bg-red-50 text-red-700 border-red-200",             dot: "bg-red-500",     label: "Lỗi" },
    disconnected: { color: "bg-zinc-100 text-zinc-500 border-zinc-200",         dot: "bg-zinc-400",    label: "Ngắt kết nối" },
  };
  const c = cfg[status] || cfg.disconnected;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === "healthy" ? "animate-pulse" : ""}`} />
      {c.label}
    </span>
  );
}

/* ─── Check Row ─────────────────────────────────────────── */
function CheckRow({ icon: Icon, label, ok, detail, missing }) {
  const iconColor = ok === true ? "text-emerald-500" : ok === false ? "text-red-500" : "text-zinc-400";
  const BulletIcon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertTriangle;
  const bulletColor = ok === true ? "text-emerald-500" : ok === false ? "text-red-500" : "text-amber-500";

  return (
    <div className="flex items-start gap-3 py-3 border-b border-zinc-100 last:border-0">
      <div className={`mt-0.5 ${iconColor}`}><Icon className="w-4 h-4" /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-800">{label}</span>
          <BulletIcon className={`w-3.5 h-3.5 ${bulletColor} flex-shrink-0`} />
        </div>
        {detail && <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{detail}</p>}
        {missing && missing.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {missing.map(m => (
              <span key={m} className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-mono">
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Page Card ─────────────────────────────────────────── */
function PageCard({ page }) {
  const [expanded, setExpanded] = useState(false);

  const borderColor = {
    healthy:      "border-emerald-200 bg-emerald-50/40",
    warning:      "border-amber-200 bg-amber-50/40",
    error:        "border-red-200 bg-red-50/30",
    disconnected: "border-zinc-200 bg-zinc-50/60",
  }[page.overall] || "border-zinc-200 bg-white";

  const avatarColor = {
    healthy:      "bg-emerald-100 text-emerald-700",
    warning:      "bg-amber-100 text-amber-700",
    error:        "bg-red-100 text-red-700",
    disconnected: "bg-zinc-200 text-zinc-500",
  }[page.overall] || "bg-zinc-200 text-zinc-500";

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${borderColor}`}>
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg ${avatarColor}`}>
            {(page.page_name || "?")[0].toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-zinc-900 truncate">{page.page_name || "Fanpage"}</h3>
              {page.is_ai_active && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-semibold">
                  <Sparkles className="w-2.5 h-2.5" /> AI ON
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">ID: {page.page_id}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <StatusBadge status={page.overall} />
              {page.fan_count != null && (
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <Users className="w-3 h-3" /> {page.fan_count?.toLocaleString()} followers
                </span>
              )}
              {page.last_message_at && (
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  <MessageCircle className="w-3 h-3" /> Tin cuối: {timeAgo(page.last_message_at)}
                </span>
              )}
              {!page.last_message_at && (
                <span className="text-xs text-zinc-400">Chưa có tin nhắn</span>
              )}
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all flex-shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick inline errors — collapsed state */}
        {page.overall !== "healthy" && !expanded && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!page.token_alive && (
              <span className="text-[11px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-lg">
                ⚠ Token hết hạn: {page.token_error}
              </span>
            )}
            {page.token_alive && !page.webhook_subscribed && (
              <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg">
                ⚠ Webhook chưa subscribe
              </span>
            )}
            {page.token_alive && page.permissions_missing?.length > 0 && (
              <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg">
                ⚠ Thiếu {page.permissions_missing.length} quyền Meta
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-zinc-200 px-5 pb-5 pt-4 bg-white/70 space-y-0">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Chi tiết kiểm tra</p>

          <CheckRow
            icon={Wifi} label="Token Facebook" ok={page.token_alive}
            detail={page.token_alive
              ? `Đang hoạt động${page.fan_count ? ` · ${page.fan_count?.toLocaleString()} followers` : ""}`
              : `Lỗi: ${page.token_error || "Token không hợp lệ"}${page.token_error_code ? ` (code ${page.token_error_code})` : ""}`
            }
          />
          <CheckRow
            icon={Webhook} label="Webhook Subscription" ok={page.webhook_subscribed}
            detail={page.webhook_subscribed
              ? `Đã subscribe · Fields: ${page.webhook_fields?.join(", ") || "N/A"}`
              : page.webhook_error || "Chưa subscribe → bot sẽ không nhận tin nhắn"
            }
          />
          <CheckRow
            icon={ShieldCheck} label="Quyền Meta API" ok={page.permissions_ok}
            detail={page.permissions_ok
              ? `Đủ quyền: ${page.permissions_granted?.length} permissions`
              : `Thiếu ${page.permissions_missing?.length} quyền bắt buộc`
            }
            missing={page.permissions_missing}
          />
          <CheckRow
            icon={Bot} label="AI Chatbot" ok={page.is_ai_active ? true : null}
            detail={page.is_ai_active ? "AI đang bật cho trang này" : "AI đang tắt"}
          />
          <CheckRow
            icon={Clock} label="Hoạt động gần nhất" ok={page.last_message_at ? true : null}
            detail={page.last_message_at
              ? `Tin nhắn lúc ${new Date(page.last_message_at).toLocaleString("vi-VN")}`
              : "Chưa ghi nhận tin nhắn nào"
            }
          />

          <div className="pt-3 flex flex-wrap gap-2">
            <a href={`https://www.facebook.com/${page.page_id}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg font-medium transition-all">
              <ExternalLink className="w-3 h-3" /> Mở Fanpage
            </a>
            <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 bg-zinc-100 border border-zinc-200 px-3 py-1.5 rounded-lg font-medium transition-all">
              <ExternalLink className="w-3 h-3" /> Graph Explorer
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function PageHealthPage() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/api/pages/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPages(data);
      setLastChecked(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const summary = {
    healthy:      pages.filter(p => p.overall === "healthy").length,
    warning:      pages.filter(p => p.overall === "warning").length,
    error:        pages.filter(p => p.overall === "error").length,
    disconnected: pages.filter(p => p.overall === "disconnected").length,
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Page Health</h1>
            <p className="text-xs text-zinc-400">
              {lastChecked ? `Kiểm tra lúc ${lastChecked.toLocaleTimeString("vi-VN")}` : "Đang kiểm tra..."}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchHealth(true)}
          disabled={refreshing || loading}
          className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-700 text-sm font-semibold rounded-xl transition-all disabled:opacity-50 border border-zinc-200 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Kiểm tra lại
        </button>
      </div>

      {/* ── Summary stats ── */}
      {!loading && pages.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Tốt",           value: summary.healthy,      color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
            { label: "Cảnh báo",      value: summary.warning,      color: "text-amber-600",   bg: "bg-amber-50 border-amber-200" },
            { label: "Lỗi",           value: summary.error,        color: "text-red-600",     bg: "bg-red-50 border-red-200" },
            { label: "Ngắt kết nối",  value: summary.disconnected, color: "text-zinc-500",    bg: "bg-zinc-50 border-zinc-200" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border rounded-xl p-3 text-center`}>
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-zinc-500 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-500" />
            </div>
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin absolute -top-1 -right-1" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-700">Đang kiểm tra tất cả Fanpage...</p>
            <p className="text-xs text-zinc-400 mt-1">Gọi Facebook Graph API, có thể mất vài giây</p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
          <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-red-700">Không thể tải dữ liệu</p>
          <p className="text-xs text-red-400 mt-1">{error}</p>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && pages.length === 0 && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-10 text-center">
          <WifiOff className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-600">Chưa kết nối Fanpage nào</p>
          <p className="text-xs text-zinc-400 mt-1">Vào Kết nối Đa kênh để thêm Fanpage</p>
          <a href="/settings/integrations" className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
            Đến trang kết nối →
          </a>
        </div>
      )}

      {/* ── Page Cards ── */}
      {!loading && pages.length > 0 && (
        <div className="space-y-3">
          {[...pages]
            .sort((a, b) => {
              const order = { error: 0, disconnected: 1, warning: 2, healthy: 3 };
              return (order[a.overall] ?? 4) - (order[b.overall] ?? 4);
            })
            .map(page => <PageCard key={page.id} page={page} />)
          }
        </div>
      )}

      {/* ── Legend ── */}
      {!loading && pages.length > 0 && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Ghi chú</p>
          <ul className="space-y-1.5 text-xs text-zinc-500">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              Token hợp lệ + Webhook subscribed + Đủ quyền = <span className="text-emerald-600 font-semibold">Hoạt động tốt</span>
            </li>
            <li className="flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
              Token OK nhưng thiếu quyền hoặc chưa subscribe webhook = <span className="text-amber-600 font-semibold">Cảnh báo</span>
            </li>
            <li className="flex items-center gap-2">
              <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
              Token hết hạn hoặc bị thu hồi = <span className="text-red-600 font-semibold">Lỗi</span> (bot không nhận được tin)
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
