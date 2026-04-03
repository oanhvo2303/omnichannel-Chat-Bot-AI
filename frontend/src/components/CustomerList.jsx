"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Search, Filter, Phone, Tag, Users, ArrowRightLeft, MessageSquare, MessageCircle, Megaphone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerList({ customers, isLoading, selectedId, onSelect, tags = [], filters = {}, onFilterChange, staffList = [], onTransfer, userRole, pages = [], selectedPageId = "", onPageChange }) {
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [transferingId, setTransferingId] = useState(null);

  const getInitial = (name) => (name ? name.charAt(0).toUpperCase() : "?");
  const avatarColors = [
    "bg-gradient-to-br from-blue-500 to-blue-600", "bg-gradient-to-br from-emerald-500 to-emerald-600",
    "bg-gradient-to-br from-violet-500 to-violet-600", "bg-gradient-to-br from-amber-500 to-amber-600",
    "bg-gradient-to-br from-rose-500 to-rose-600", "bg-gradient-to-br from-cyan-500 to-cyan-600",
    "bg-gradient-to-br from-pink-500 to-pink-600", "bg-gradient-to-br from-indigo-500 to-indigo-600",
  ];
  const getAvatarColor = (id) => avatarColors[id % avatarColors.length];

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    const date = new Date(timeStr);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    if (diffMins < 1) return "Vừa xong";
    if (diffMins < 60) return `${diffMins}p`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  };

  const activeFilterCount = [filters.has_phone, filters.tag_id].filter(Boolean).length;

  const platformBadge = (platform, pageId) => {
    if (platform?.startsWith('facebook')) {
      if (pageId) {
        return { isImage: true, url: `https://graph.facebook.com/${pageId}/picture?type=small` };
      }
      return { bg: "bg-[#1877F2]", label: "f" };
    }
    const badges = {
      zalo: { bg: "bg-[#0068FF]", label: "Z" },
      instagram: { bg: "bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888]", label: "📷" },
      shopee: { bg: "bg-[#EE4D2D]", label: "S" },
      tiktok: { bg: "bg-[#010101]", label: "♪" },
    };
    return badges[platform] || null;
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-zinc-200/80">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-zinc-900">Đoạn chat</h2>
            <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{customers.length}</span>
          </div>
          {/* Lọc Theo Fanpage */}
          {pages.length > 0 && (
            <select value={selectedPageId} onChange={(e) => onPageChange?.(e.target.value)}
              className="text-[11px] font-medium bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 max-w-[130px] truncate transition-all cursor-pointer">
              <option value="">Tất cả Page</option>
              {pages.map((p) => <option key={p.page_id} value={p.page_id}>{p.page_name || `Page ${p.page_id.slice(-4)}`}</option>)}
            </select>
          )}
          
          {/* Lọc Theo Staff / Assigment */}
          <select value={filters.assign_filter || ""} onChange={(e) => onFilterChange?.({ ...filters, assign_filter: e.target.value })}
            className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500/20 w-fit transition-all cursor-pointer truncate max-w-[120px]">
            {userRole !== 'staff' && <option value="">Toàn bộ khách</option>}
            {userRole === 'staff' && <option value="">Phạm vi của tôi</option>}
            <option value="me">Đang phụ trách</option>
            <option value="unassigned">Chưa rẽ nhánh</option>
          </select>

          {/* Lọc Theo Message Type */}
          <select value={filters.message_type || ""} onChange={(e) => onFilterChange?.({ ...filters, message_type: e.target.value })}
            className="text-[11px] font-medium bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 w-fit transition-all cursor-pointer truncate max-w-[120px]">
            <option value="">Tất cả Hội thoại</option>
            <option value="inbox">Chỉ Tin Nhắn</option>
            <option value="comment">Chỉ Bình Luận</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input type="text" placeholder="Tìm khách hàng..." value={filters.search || ""}
            onChange={(e) => onFilterChange?.({ ...filters, search: e.target.value })}
            className="w-full px-4 py-2.5 pl-10 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-zinc-400" />
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => onFilterChange?.({ ...filters, has_phone: filters.has_phone ? "" : "1" })}
            className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border",
              filters.has_phone ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm" : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50")}>
            <Phone className="w-3 h-3" /> SĐT
          </button>
          <button onClick={() => setShowTagFilter(!showTagFilter)}
            className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border",
              filters.tag_id ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm" : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50")}>
            <Tag className="w-3 h-3" /> Thẻ {filters.tag_id && "✓"}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={() => onFilterChange?.({})} className="text-[10px] text-zinc-400 hover:text-zinc-600 ml-auto transition-colors">Xóa lọc</button>
          )}
        </div>

        {showTagFilter && (
          <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-50 rounded-xl border border-zinc-100 animate-in fade-in-0">
            {tags.map((tag) => (
              <button key={tag.id} onClick={() => { onFilterChange?.({ ...filters, tag_id: filters.tag_id === String(tag.id) ? "" : String(tag.id) }); setShowTagFilter(false); }}
                className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border",
                  filters.tag_id === String(tag.id) ? "text-white border-transparent shadow-md scale-105" : "text-zinc-600 border-zinc-200 bg-white hover:scale-105")}
                style={filters.tag_id === String(tag.id) ? { backgroundColor: tag.color } : {}}>
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Customer List */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-0.5 pointer-events-none">
                <Skeleton className="w-11 h-11 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2 py-1">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-28 rounded" />
                    <Skeleton className="h-3 w-10 rounded" />
                  </div>
                  <Skeleton className="h-3 w-40 rounded" />
                  <div className="flex gap-1 mt-1">
                    <Skeleton className="h-3 w-8 rounded-full" />
                    <Skeleton className="h-3 w-12 rounded-full" />
                  </div>
                </div>
              </div>
            ))
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
              <Users className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Chưa có cuộc trò chuyện</p>
            </div>
          ) : null}
          {!isLoading && customers.map((customer) => {
            const badge = platformBadge(customer.platform, customer.page_id);
            console.log("Customer Data Render:", customer);
            return (
              <button key={customer.id} onClick={() => onSelect(customer)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150 group mb-0.5",
                  selectedId === customer.id ? "bg-blue-50 border border-blue-100 shadow-sm" : "hover:bg-zinc-50 border border-transparent"
                )}>
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className={cn("w-11 h-11 overflow-hidden rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-white shadow-sm", getAvatarColor(customer.id))}>
                    {customer.avatar_url ? (
                      <img src={customer.avatar_url} alt={customer.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      getInitial(customer.name)
                    )}
                  </div>
                  {badge && (
                    <div className={cn("absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full border-2 border-white flex items-center justify-center overflow-hidden", badge.bg || "bg-white")}>
                      {badge.isImage ? (
                        <img src={badge.url} alt="page" className="w-full h-full object-cover" crossOrigin="anonymous" onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <span className="text-white text-[8px] font-black">{badge.label}</span>
                      )}
                    </div>
                  )}
                  {!badge && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[13px] font-semibold truncate", selectedId === customer.id ? "text-blue-900" : "text-zinc-800")}>
                      {customer.name || `Khách #${customer.platform_id?.slice(-4)}`}
                    </span>
                    <span className="text-[10px] text-zinc-400 flex-shrink-0 ml-2">{formatTime(customer.lastTime)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {customer.lastMessageType === 'comment' ? (
                        <Megaphone className="w-3.5 h-3.5 flex-shrink-0 text-orange-500" />
                      ) : (
                        <MessageCircle className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" />
                      )}
                      <p className="text-[12px] text-zinc-500 truncate">{customer.lastMessage || "Chưa có tin nhắn"}</p>
                    </div>
                    {customer.unread > 0 && (
                      <span className="flex-shrink-0 ml-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
                        {customer.unread > 9 ? "9+" : customer.unread}
                      </span>
                    )}
                  </div>
                  {/* Tags + Staff */}
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {customer.tags?.slice(0, 3).map((tag) => (
                      <span key={tag.id} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full text-white shadow-sm" style={{ backgroundColor: tag.color }}>{tag.name}</span>
                    ))}
                    {customer.assigned_staff_name && (
                      <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 flex items-center gap-0.5">
                        <Users className="w-2.5 h-2.5" /> {customer.assigned_staff_name}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
