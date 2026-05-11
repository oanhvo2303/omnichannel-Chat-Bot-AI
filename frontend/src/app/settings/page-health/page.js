"use client";
import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Wifi, WifiOff,
  Bot, Users, Webhook, ShieldCheck, ShieldAlert, MessageCircle,
  Clock, ExternalLink, Loader2, Activity, ChevronDown, ChevronUp,
  Sparkles, SparklesIcon
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

function StatusBadge({ status }) {
  const cfg = {
    healthy:      { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400", label: "Hoạt động tốt" },
    warning:      { color: "bg-amber-500/15 text-amber-400 border-amber-500/30",       dot: "bg-amber-400",   label: "Cảnh báo" },
    error:        { color: "bg-red-500/15 text-red-400 border-red-500/30",             dot: "bg-red-400",     label: "Lỗi" },
    disconnected: { color: "bg-zinc-700/40 text-zinc-400 border-zinc-600/30",          dot: "bg-zinc-500",    label: "Ngắt kết nối" },
  };
  const c = cfg[status] || cfg.disconnected;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === "healthy" ? "animate-pulse" : ""}`} />
      {c.label}
    </span>
  );
}

function CheckRow({ icon: Icon, label, ok, detail, warning, missing }) {
  const color = ok === true ? "text-emerald-400" : ok === false ? "text-red-400" : "text-zinc-500";
  const BulletIcon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertTriangle;
  const bulletColor = ok === true ? "text-emerald-400" : ok === false ? "text-red-400" : "text-amber-400";

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-800/50 last:border-0">
      <div className={`mt-0.5 ${color}`}><Icon className="w-4 h-4" /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          <BulletIcon className={`w-3.5 h-3.5 ${bulletColor} flex-shrink-0`} />
        </div>
        {detail && <p className="text-xs text-zinc-500 mt-0.5">{detail}</p>}
        {missing && missing.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {missing.map(m => (
              <span key={m} className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-mono">
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PageCard({ page, index }) {
  const [expanded, setExpanded] = useState(false);

  const overallGradient = {
    healthy:      "from-emerald-500/10 to-transparent border-emerald-500/20",
    warning:      "from-amber-500/10 to-transparent border-amber-500/20",
    error:        "from-red-500/10 to-transparent border-red-500/20",
    disconnected: "from-zinc-800/50 to-transparent border-zinc-700/30",
  }[page.overall] || "from-zinc-800/50 to-transparent border-zinc-700/30";

  return (
    <div className={`bg-gradient-to-r ${overallGradient} border rounded-2xl overflow-hidden transition-all`}>
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            page.overall === "healthy" ? "bg-emerald-500/20" :
            page.overall === "warning" ? "bg-amber-500/20" :
            page.overall === "error" ? "bg-red-500/20" : "bg-zinc-700/40"
          }`}>
            <span className="text-lg font-bold text-white">
              {(page.page_name || "?")[0].toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white truncate">{page.page_name || "Fanpage"}</h3>
              {page.is_ai_active && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                  <Sparkles className="w-2.5 h-2.5" /> AI ON
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">ID: {page.page_id}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <StatusBadge status={page.overall} />
              {page.fan_count != null && (
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  <Users className="w-3 h-3" /> {page.fan_count?.toLocaleString()} followers
                </span>
              )}
              {page.last_message_at && (
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <MessageCircle className="w-3 h-3" /> Tin cuối: {timeAgo(page.last_message_at)}
                </span>
              )}
              {!page.last_message_at && (
                <span className="text-xs text-zinc-600">Chưa có tin nhắn</span>
              )}
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-all flex-shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick summary errors */}
        {page.overall !== "healthy" && !expanded && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!page.token_alive && (
              <span className="text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-lg">
                ⚠ Token hết hạn: {page.token_error}
              </span>
            )}
            {page.token_alive && !page.webhook_subscribed && (
              <span className="text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                ⚠ Webhook chưa subscribe
              </span>
            )}
            {page.token_alive && page.permissions_missing?.length > 0 && (
              <span className="text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                ⚠ Thiếu {page.permissions_missing.length} quyền Meta
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-zinc-800/50 px-5 pb-5 pt-4 space-y-1">
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Chi tiết kiểm tra</p>

          <CheckRow
            icon={Wifi}
            label="Token Facebook"
            ok={page.token_alive}
            detail={page.token_alive
              ? `Đang hoạt động${page.fan_count ? ` · ${page.fan_count?.toLocaleString()} followers` : ""}`
              : `Lỗi: ${page.token_error || "Token không hợp lệ"}${page.token_error_code ? ` (code ${page.token_error_code})` : ""}`
            }
          />

          <CheckRow
            icon={Webhook}
            label="Webhook Subscription"
            ok={page.webhook_subscribed}
            detail={page.webhook_subscribed
              ? `Đã subscribe · Fields: ${page.webhook_fields?.join(", ") || "N/A"}`
              : page.webhook_error || "Chưa subscribe → bot sẽ không nhận tin nhắn"
            }
          />

          <CheckRow
            icon={ShieldCheck}
            label="Quyền Meta API"
            ok={page.permissions_ok}
            detail={page.permissions_ok
              ? `Đủ quyền: ${page.permissions_granted?.length} permissions`
              : `Thiếu ${page.permissions_missing?.length} quyền bắt buộc`
            }
            missing={page.permissions_missing}
          />

          <CheckRow
            icon={Bot}
            label="AI Chatbot"
            ok={page.is_ai_active ? true : null}
            detail={page.is_ai_active ? "AI đang bật cho trang này" : "AI đang tắt"}
          />

          <CheckRow
            icon={Clock}
            label="Hoạt động gần nhất"
            ok={page.last_message_at ? true : null}
            detail={page.last_message_at
              ? `Tin nhắn lúc ${new Date(page.last_message_at).toLocaleString("vi-VN")}`
              : "Chưa ghi nhận tin nhắn nào"
            }
          />

          {/* Action links */}
          <div className="pt-3 flex flex-wrap gap-2">
            <a
              href={`https://www.facebook.com/${page.page_id}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-all"
            >
              <ExternalLink className="w-3 h-3" /> Mở Fanpage
            </a>
            <a
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700/30 border border-zinc-600/30 px-3 py-1.5 rounded-lg transition-all"
            >
              <ExternalLink className="w-3 h-3" /> Graph Explorer
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

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
    healthy: pages.filter(p => p.overall === "healthy").length,
    warning: pages.filter(p => p.overall === "warning").length,
    error: pages.filter(p => p.overall === "error").length,
    disconnected: pages.filter(p => p.overall === "disconnected").length,
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Page Health</h1>
            <p className="text-xs text-zinc-500">
              {lastChecked ? `Kiểm tra lúc ${lastChecked.toLocaleTimeString("vi-VN")}` : "Đang kiểm tra..."}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchHealth(true)}
          disabled={refreshing || loading}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 border border-zinc-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Kiểm tra lại
        </button>
      </div>

      {/* Summary stats */}
      {!loading && pages.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Tốt", value: summary.healthy, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { label: "Cảnh báo", value: summary.warning, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
            { label: "Lỗi", value: summary.error, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { label: "Ngắt kết nối", value: summary.disconnected, color: "text-zinc-400", bg: "bg-zinc-700/30 border-zinc-600/30" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border rounded-xl p-3 text-center`}>
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-zinc-500 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin absolute -top-1 -right-1" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-300">Đang kiểm tra tất cả Fanpage...</p>
            <p className="text-xs text-zinc-500 mt-1">Gọi Facebook Graph API, có thể mất vài giây</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 text-center">
          <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-red-300">Không thể tải dữ liệu</p>
          <p className="text-xs text-red-400/70 mt-1">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && pages.length === 0 && (
        <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-2xl p-10 text-center">
          <WifiOff className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-400">Chưa kết nối Fanpage nào</p>
          <p className="text-xs text-zinc-600 mt-1">Vào Kết nối Đa kênh để thêm Fanpage</p>
          <a href="/settings/integrations" className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline">
            Đến trang kết nối →
          </a>
        </div>
      )}

      {/* Page cards */}
      {!loading && pages.length > 0 && (
        <div className="space-y-3">
          {/* Sort: error first, then warning, then healthy */}
          {[...pages]
            .sort((a, b) => {
              const order = { error: 0, disconnected: 1, warning: 2, healthy: 3 };
              return (order[a.overall] ?? 4) - (order[b.overall] ?? 4);
            })
            .map((page, i) => <PageCard key={page.id} page={page} index={i} />)
          }
        </div>
      )}

      {/* Legend */}
      {!loading && pages.length > 0 && (
        <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-xl p-4">
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Ghi chú</p>
          <ul className="space-y-1 text-xs text-zinc-500">
            <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" /> Token hợp lệ + Webhook subscribed + Đủ quyền = <span className="text-emerald-400 font-semibold">Hoạt động tốt</span></li>
            <li className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" /> Token OK nhưng thiếu quyền hoặc chưa subscribe webhook = <span className="text-amber-400 font-semibold">Cảnh báo</span></li>
            <li className="flex items-center gap-2"><XCircle className="w-3 h-3 text-red-400 flex-shrink-0" /> Token hết hạn hoặc bị thu hồi = <span className="text-red-400 font-semibold">Lỗi</span> (bot không nhận được tin)</li>
          </ul>
        </div>
      )}
    </div>
  );
}
