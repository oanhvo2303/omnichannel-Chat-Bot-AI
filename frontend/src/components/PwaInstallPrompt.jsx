"use client";

import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";

// Đăng ký Service Worker
function useRegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => console.log("[SW] Registered:", reg.scope))
        .catch((err) => console.error("[SW] Error:", err));
    }
  }, []);
}

// Banner gợi ý cài đặt PWA
export default function PwaInstallPrompt() {
  useRegisterSW();

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Kiểm tra đã cài chưa
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    // Kiểm tra đã dismiss chưa
    const dismissed = sessionStorage.getItem("pwa-banner-dismissed");
    if (dismissed) return;

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    if (ios) {
      // iOS không có beforeinstallprompt — hiện hướng dẫn manual
      setTimeout(() => setShowBanner(true), 3000);
      return;
    }

    // Android/Chrome: bắt sự kiện install
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShowBanner(true), 2000);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setShowBanner(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem("pwa-banner-dismissed", "1");
  };

  if (!showBanner || isStandalone) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] md:left-auto md:right-4 md:w-80 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl shadow-black/50 flex gap-3">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg">
          <Smartphone className="w-6 h-6 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Cài OmniBot lên điện thoại</p>
          {isIOS ? (
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              Nhấn <span className="text-blue-400 font-semibold">Chia sẻ</span>{" "}
              → <span className="text-blue-400 font-semibold">Thêm vào màn hình chính</span>
            </p>
          ) : (
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Dùng như app thật, không cần App Store
            </p>
          )}

          {!isIOS && (
            <button
              onClick={handleInstall}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-colors"
            >
              <Download className="w-3 h-3" />
              Cài đặt ngay
            </button>
          )}
        </div>

        {/* Close */}
        <button
          onClick={handleDismiss}
          className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0 self-start"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
