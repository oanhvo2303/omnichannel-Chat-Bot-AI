"use client";

import { useState, useEffect } from "react";
import { API_BASE, authFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Loader2, Phone, MapPin, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CustomersCRMPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Filters
  const [search, setSearch] = useState("");
  const [hasPhone, setHasPhone] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [customerType, setCustomerType] = useState("buyers");
  const [availableTags, setAvailableTags] = useState([]);

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchCustomers();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, hasPhone, tagFilter, page, customerType]);


  const fetchTags = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/tags`);
      if (res.ok) setAvailableTags(await res.json());
    } catch { /* ignore */ }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      if (search) params.append("search", search);
      if (hasPhone === "1") params.append("has_phone", "1");
      if (tagFilter !== "all") params.append("tag_id", tagFilter);
      params.append("customer_type", customerType);

      const res = await authFetch(`${API_BASE}/api/customers/advanced?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setCustomers(result.data);
        setTotalRecords(result.pagination.total);
        setTotalPages(result.pagination.total_pages);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ["ID", "Tên Khách Hàng", "Số Điện Thoại", "Địa Chỉ", "Platform", "Tổng Đơn", "Tổng Chi Tiêu (VND)", "Tags"];
    const rows = customers.map(c => [
      c.id,
      `"${c.name || ''}"`,
      c.phone || '',
      `"${c.address ? c.address.replace(/"/g, '""') : ''}"`,
      c.platform,
      c.total_orders || 0,
      c.total_spent || 0,
      `"${c.tags?.map(t => t.name).join(', ') || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `customers_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* Page Header — outside the card, on the muted background */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Quản lý Khách hàng CRM
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Tổng quan thông tin thẻ, địa chỉ và lịch sử chi tiêu khách hàng (LTV).
        </p>
      </div>

      {/* Main Content Card — elevated white surface */}
      <div className="flex-1 flex flex-col mx-6 mb-6 bg-card border border-border rounded-xl shadow-sm overflow-hidden">

        {/* Toolbar row: Tabs + Filters inline */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
          {/* Left: Tabs */}
          <Tabs value={customerType} onValueChange={(val) => { setCustomerType(val); setPage(1); }} className="w-fit shrink-0">
            <TabsList className="bg-muted/60 p-1 rounded-lg h-9">
              <TabsTrigger value="buyers" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm px-3.5 h-7">
                Khách đã mua (Buyers)
              </TabsTrigger>
              <TabsTrigger value="leads" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm px-3.5 h-7">
                Khách tiềm năng (Leads)
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Right: Search + Filters + Export */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-56 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Tìm theo Tên hoặc SĐT..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 h-8 text-sm bg-muted/40 border-border focus-visible:ring-1 focus-visible:bg-background"
              />
            </div>

            <Select value={hasPhone} onValueChange={(val) => { setHasPhone(val); setPage(1); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs bg-muted/40 border-border">
                <SelectValue placeholder="Trạng thái SĐT" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả Khách</SelectItem>
                <SelectItem value="1">Đã có SĐT</SelectItem>
              </SelectContent>
            </Select>

            <Select value={tagFilter} onValueChange={(val) => { setTagFilter(val); setPage(1); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs bg-muted/40 border-border">
                <SelectValue placeholder="Lọc theo Thẻ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả Thẻ</SelectItem>
                {availableTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id.toString()}>{tag.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={exportToCSV} variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>

            <span className="text-xs text-muted-foreground ml-1 hidden lg:inline-flex tabular-nums">
              {customers.length} / {totalRecords}
            </span>
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-slate-100/60 dark:bg-muted/50 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="w-[280px] h-11 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Khách hàng</TableHead>
                <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Liên hệ & Địa chỉ</TableHead>
                <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thẻ (Tags)</TableHead>
                <TableHead className="text-right h-11 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tổng mua</TableHead>
                <TableHead className="text-right h-11 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tổng tiền (LTV)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-80">
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="w-10 h-10 animate-spin text-primary/60 mb-3" />
                      <span className="text-sm font-medium">Đang tải dữ liệu khách hàng...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : customers.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-80">
                    <div className="flex flex-col items-center justify-center p-12">
                      <div className="w-16 h-16 rounded-full bg-muted/80 flex items-center justify-center mb-4">
                        <Users className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <h3 className="text-base font-semibold text-foreground mb-1.5">Chưa có dữ liệu khách hàng</h3>
                      <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
                        Danh sách khách hàng sẽ xuất hiện ở đây khi có người nhắn tin hoặc phát sinh đơn hàng mới.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((c) => (
                  <TableRow key={c.id} className="group cursor-pointer transition-colors hover:bg-muted/40 border-b border-border/60">
                    <TableCell className="px-5 py-4">
                      <div className="flex items-center gap-3.5">
                        <Avatar className="w-10 h-10 border border-border shadow-sm">
                          <AvatarImage src={c.avatar_url || ""} />
                          <AvatarFallback className="bg-muted text-muted-foreground font-semibold text-xs">
                            {c.name ? c.name.slice(0, 2).toUpperCase() : "??"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground tracking-tight group-hover:text-primary transition-colors">
                            {c.name || 'Khách hàng'}
                          </span>
                          <span className="text-[11px] text-muted-foreground mt-0.5">{c.platform}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <div className="flex flex-col gap-1.5">
                        {c.phone ? (
                          <div className="flex items-center gap-2 text-sm text-foreground font-medium">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground/70" /> {c.phone}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic">Chưa cập nhật SĐT</span>
                        )}
                        {c.address ? (
                          <div className="flex items-start gap-2 text-xs text-muted-foreground">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> 
                            <span className="line-clamp-1 max-w-[200px]" title={c.address}>{c.address}</span>
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                        {(!c.tags || c.tags.length === 0) && (
                          <Badge variant="secondary" className="text-[10px] text-muted-foreground/70 font-medium px-2 py-0.5 bg-muted/80 pointer-events-none">
                            New Lead
                          </Badge>
                        )}
                        {c.tags?.map((tag) => (
                          <Badge key={tag.id} variant="outline" className="text-[10px] px-2 py-0.5" style={{ color: tag.color, borderColor: `${tag.color}40`, backgroundColor: `${tag.color}10` }}>
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-4 py-4">
                      <span className={cn("text-sm font-medium tabular-nums", c.total_orders > 0 ? "text-foreground" : "text-muted-foreground/40")}>
                        {c.total_orders || 0} đơn
                      </span>
                    </TableCell>
                    <TableCell className="text-right px-5 py-4">
                      <span className={cn("text-sm tabular-nums", c.total_spent > 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-medium text-muted-foreground/40")}>
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(c.total_spent || 0)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 bg-muted/20">
            <span className="text-xs text-muted-foreground tabular-nums">Trang {page} / {totalPages} · {totalRecords} khách hàng</span>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="h-7 text-xs px-3"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Trước
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="h-7 text-xs px-3"
              >
                Sau <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

