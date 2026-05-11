"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Bot, Package, Tags, Contact,
  BarChart3, Megaphone, ChevronLeft, ChevronRight, Zap, Sparkles,
  LogOut, Settings, PanelLeftClose, PanelLeft, Link2, Activity, Send, UserCog, ClipboardList, MessageSquareReply,
  Crown, X
} from "lucide-react";

const menuItems = [
  { id: "chat", label: "Hội thoại", icon: MessageSquare, href: "/" },
  { id: "customers", label: "Khách hàng CRM", icon: Contact, href: "/customers" },
  { id: "orders", label: "Quản lý Đơn hàng", icon: ClipboardList, href: "/orders" },
  { id: "analytics", label: "Thống kê", icon: BarChart3, href: "/dashboard/analytics" },
  { id: "broadcast", label: "Broadcast", icon: Megaphone, href: "/dashboard/broadcast" },
  { id: "remarketing", label: "Re-marketing", icon: Send, href: "/dashboard/remarketing" },
  { type: "divider", label: "CÀI ĐẶT" },
  { id: "ai-settings", label: "Cài đặt AI", icon: Sparkles, href: "/settings/ai" },
  { id: "bot", label: "Kịch bản Bot", icon: Bot, href: "/settings/bot" },
  { id: "auto-comment", label: "Auto Comment", icon: MessageSquareReply, href: "/settings/auto-comment" },
  { id: "products", label: "Sản phẩm & Kho", icon: Package, href: "/settings/products" },
  { id: "tags", label: "Quản lý Thẻ", icon: Tags, href: "/settings/tags" },
  { id: "quick-replies", label: "Tin nhắn Mẫu", icon: Zap, href: "/settings/quick-replies" },
  { id: "staff", label: "Nhân sự", icon: UserCog, href: "/settings/staff" },
  { id: "integrations", label: "Kết nối Đa kênh", icon: Link2, href: "/settings/integrations" },
  { id: "page-health", label: "Page Health", icon: Activity, href: "/settings/page-health" },
  { id: "tracking", label: "Pixel & Tracking", icon: Activity, href: "/settings/tracking" },
];

export default function Sidebar({ onMobileClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [shop, setShop] = useState(null);
  const isMobileDrawer = typeof onMobileClose === "function";

  useEffect(() => {
    try {
      const shopData = localStorage.getItem("shop");
      if (shopData) setShop(JSON.parse(shopData));
    } catch { /* */ }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("shop");
    router.push("/login");
  };

  const isActive = (href) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const handleNav = (href) => {
    router.push(href);
    if (isMobileDrawer) onMobileClose();
  };

  // On mobile drawer: always expanded
  const showExpanded = isMobileDrawer ? true : !collapsed;

  return (
    <div className={cn(
      "h-full flex flex-col bg-zinc-950 text-white transition-all duration-300 ease-in-out relative flex-shrink-0",
      isMobileDrawer ? "w-[260px]" : (collapsed ? "w-[68px]" : "w-[240px]")
    )}>
      {/* Logo + Brand */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-zinc-800/80">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
          <Bot className="w-4.5 h-4.5 text-white" />
        </div>
        {showExpanded && (
          <div className="flex-1 overflow-hidden">
            <h1 className="text-sm font-bold truncate">OmniBot</h1>
            <p className="text-[10px] text-zinc-500 truncate">{shop?.shop_name || "Dashboard"}</p>
          </div>
        )}
        {/* Close button on mobile drawer */}
        {isMobileDrawer && (
          <button onClick={onMobileClose}
            className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Menu Items */}
      <nav className="flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto">
        {menuItems.map((item, i) => {
          if (item.type === "divider") {
            return (
              <div key={i} className="pt-4 pb-1.5 px-2">
                {showExpanded && (
                  <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.15em]">{item.label}</span>
                )}
                {!showExpanded && <hr className="border-zinc-800" />}
              </div>
            );
          }

          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <button key={item.id} onClick={() => handleNav(item.href)}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl transition-all duration-150 group relative",
                !showExpanded ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                active
                  ? "bg-gradient-to-r from-blue-600/20 to-indigo-600/10 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              )}>
              {/* Active indicator */}
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
              )}
              <Icon className={cn(
                "flex-shrink-0 transition-colors",
                active ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-300",
                !showExpanded ? "w-5 h-5" : "w-[18px] h-[18px]"
              )} />
              {showExpanded && (
                <span className={cn("text-[13px] truncate", active ? "font-semibold" : "font-medium")}>{item.label}</span>
              )}

              {/* Tooltip for collapsed desktop state */}
              {!showExpanded && !isMobileDrawer && (
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-white text-[11px] font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none whitespace-nowrap z-50 shadow-xl border border-zinc-700">
                  {item.label}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-zinc-800" />
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* SUPER_ADMIN section */}
      {shop?.role === 'SUPER_ADMIN' && (
        <div className="px-2.5 pb-2">
          <div className="pt-1 pb-1.5 px-2">
            {showExpanded && (
              <span className="text-[9px] font-bold text-rose-500/70 uppercase tracking-[0.15em]">Nền tảng</span>
            )}
            {!showExpanded && <hr className="border-rose-900/40" />}
          </div>
          <button
            onClick={() => handleNav('/admin/shops')}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl transition-all duration-150 group relative",
              !showExpanded ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
              pathname.startsWith('/admin')
                ? "bg-gradient-to-r from-rose-600/20 to-orange-600/10 text-white"
                : "text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/10"
            )}>
            {pathname.startsWith('/admin') && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-rose-500 rounded-r-full" />
            )}
            <Crown className={cn(
              "flex-shrink-0 transition-colors",
              pathname.startsWith('/admin') ? "text-rose-400" : "text-rose-500/60 group-hover:text-rose-400",
              !showExpanded ? "w-5 h-5" : "w-[18px] h-[18px]"
            )} />
            {showExpanded && (
              <span className={cn("text-[13px] truncate", pathname.startsWith('/admin') ? "font-semibold" : "font-medium")}>
                Quản trị Shop
              </span>
            )}
          </button>
        </div>
      )}

      {/* Bottom: Collapse toggle + Logout */}
      <div className="border-t border-zinc-800/80 p-2.5 space-y-1">
        {/* Collapse toggle — desktop only */}
        {!isMobileDrawer && (
          <button onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition-all"
            style={{ justifyContent: collapsed ? "center" : "flex-start" }}>
            {collapsed ? <PanelLeft className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
            {showExpanded && <span className="text-[13px] font-medium">Thu gọn</span>}
          </button>
        )}
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          style={{ justifyContent: showExpanded ? "flex-start" : "center" }}>
          <LogOut className="w-[18px] h-[18px]" />
          {showExpanded && <span className="text-[13px] font-medium">Đăng xuất</span>}
        </button>
      </div>
    </div>
  );
}
