"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { Menu, Bot } from "lucide-react";

const noSidebarPaths = ["/login", "/register"];
const noSidebarPrefixes = ["/admin"];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const hideSidebar =
    noSidebarPaths.includes(pathname) ||
    noSidebarPrefixes.some((p) => pathname?.startsWith(p));

  if (hideSidebar) return <>{children}</>;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ═══ Mobile Top Bar (hidden on md+) ═══ */}
      <header className="md:hidden flex items-center gap-3 px-4 h-14 bg-zinc-950 border-b border-zinc-800 flex-shrink-0 z-40">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-white">OmniBot</span>
        </div>
      </header>

      {/* ═══ Main content area ═══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop sidebar (always visible md+) */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            {/* Drawer */}
            <div className="fixed top-0 left-0 h-full z-50 md:hidden animate-in slide-in-from-left duration-200">
              <Sidebar onMobileClose={() => setMobileOpen(false)} />
            </div>
          </>
        )}

        {/* Page content */}
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
