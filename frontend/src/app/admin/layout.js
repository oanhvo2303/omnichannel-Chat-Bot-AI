"use client";

import { Inter } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, ShieldCheck, LogOut, Crown,
  ChevronRight, Zap, Globe
} from "lucide-react";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

const MENU = [
  { label: "Tổng quan", href: "/admin", icon: LayoutDashboard },
  { label: "Quản lý Shop", href: "/admin/shops", icon: Users },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [shopInfo, setShopInfo] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("shop");
      if (!raw) { router.push("/login"); return; }
      const shop = JSON.parse(raw);
      if (shop.role !== "SUPER_ADMIN") {
        router.push("/");
        return;
      }
      setShopInfo(shop);
      setIsAuthorized(true);
    } catch {
      router.push("/login");
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("shop");
    router.push("/login");
  };

  if (!isAuthorized) {
    return (
      <div className={`min-h-screen bg-[#09090b] flex items-center justify-center ${inter.className}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 font-medium text-sm">Verifying access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#09090b] text-[#fafafa] font-sans antialiased flex ${inter.className}`}>
      {/* ═══ SIDEBAR ═══ */}
      <aside className="w-64 bg-black border-r border-white/[0.06] flex flex-col fixed h-screen z-50">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-600 via-red-600 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <Crown className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white tracking-tight">God Mode</p>
              <p className="text-[10px] text-zinc-500 font-medium">SaaS Platform Console</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <p className="px-3 mb-2 text-[9px] font-bold text-zinc-600 uppercase tracking-[0.15em]">Quản trị</p>
          {MENU.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <a key={item.href} href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all group relative",
                  isActive
                    ? "bg-gradient-to-r from-rose-500/15 to-orange-500/10 text-rose-400 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                )}>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-rose-500 rounded-r-full" />
                )}
                <Icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-rose-400" : "text-zinc-600 group-hover:text-zinc-400")} />
                {item.label}
                {isActive && <ChevronRight className="w-3 h-3 ml-auto text-rose-500/50" />}
              </a>
            );
          })}

          <div className="!mt-6">
            <p className="px-3 mb-2 text-[9px] font-bold text-zinc-600 uppercase tracking-[0.15em]">Hệ thống</p>
            <a href="/" target="_blank"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] transition-all">
              <Globe className="w-4 h-4 text-zinc-600" /> Xem Platform
            </a>
          </div>
        </nav>

        {/* Footer: User Info */}
        <div className="px-3 py-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-zinc-900/50">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-600 to-orange-500 flex items-center justify-center text-white font-black text-xs shadow">
              {shopInfo?.email?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-zinc-300 truncate">{shopInfo?.email}</p>
              <p className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" /> SUPER ADMIN
              </p>
            </div>
            <button onClick={handleLogout} title="Đăng xuất"
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-1 ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
}
