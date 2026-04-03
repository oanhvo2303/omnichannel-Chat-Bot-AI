"use client";

import { useRouter } from "next/navigation";
import { ShieldOff, Mail, LogOut, RefreshCw } from "lucide-react";

export default function SuspendedPage() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("shop");
    router.push("/login");
  };

  const handleRetry = () => {
    // Reload to re-check license status
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
        {/* Icon */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping" />
          <div className="relative z-10 w-24 h-24 bg-gradient-to-br from-red-600 to-rose-700 rounded-full flex items-center justify-center shadow-2xl shadow-red-500/30">
            <ShieldOff className="w-12 h-12 text-white" />
          </div>
        </div>

        {/* Message */}
        <div className="space-y-3">
          <h1 className="text-3xl font-black text-white">Tài khoản bị khóa</h1>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
            Tài khoản của bạn đã bị <span className="text-red-400 font-bold">tạm ngưng hoạt động</span> hoặc
            <span className="text-amber-400 font-bold"> hết hạn sử dụng</span>.
            Tất cả các tính năng (AI chatbot, chốt đơn, vận chuyển) đã bị vô hiệu hóa.
          </p>
        </div>

        {/* Contact */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 space-y-4 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Liên hệ Quản trị viên</p>
              <p className="text-xs text-zinc-500">Để gia hạn hoặc mở khóa tài khoản</p>
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
            <p className="text-xs text-zinc-500 mb-1">Email hỗ trợ</p>
            <p className="text-sm font-bold text-blue-400">admin@omnichannel.vn</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={handleRetry}
            className="flex-1 py-3 text-sm font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-all flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
          <button onClick={handleLogout}
            className="flex-1 py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20">
            <LogOut className="w-4 h-4" /> Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
