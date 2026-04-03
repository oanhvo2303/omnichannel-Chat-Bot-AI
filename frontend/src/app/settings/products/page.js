"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Package, Plus, Search, Edit3, Trash2, DollarSign, Hash, Save, PackageOpen,
  Loader2, AlertTriangle, ArrowUpDown, BarChart3, Layers, X
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const authFetch = async (url, opts = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers } });
};

export default function ProductsSettingsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", price: "", stock_quantity: "", image_url: "" });
  const [volumeEnabled, setVolumeEnabled] = useState(false);
  const [volumeTiers, setVolumeTiers] = useState([]);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Sort
  const [sortBy, setSortBy] = useState("name"); // name, price, stock
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/products`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const filtered = products
    .filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "price") cmp = a.price - b.price;
      else if (sortBy === "stock") cmp = a.stock_quantity - b.stock_quantity;
      else cmp = a.name.localeCompare(b.name);
      return sortDir === "desc" ? -cmp : cmp;
    });

  const resetForm = () => {
    setForm({ name: "", sku: "", price: "", stock_quantity: "", image_url: "" });
    setVolumeEnabled(false);
    setVolumeTiers([]);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast({ title: "❌ Thiếu tên", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/api/products`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(), sku: form.sku || null,
          price: Number(form.price) || 0, stock_quantity: Number(form.stock_quantity) || 0,
          image_url: form.image_url || null,
          volume_pricing: volumeEnabled && volumeTiers.length > 0
            ? volumeTiers.map(t => ({ min_qty: Number(t.min_qty), price: Number(t.price) })).filter(t => t.min_qty > 0 && t.price > 0)
            : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts((prev) => [...prev, data]);
        setShowAddDialog(false);
        resetForm();
        toast({ title: "✅ Thêm sản phẩm", description: data.name });
      } else {
        toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setForm({
      name: product.name, sku: product.sku || "",
      price: String(product.price), stock_quantity: String(product.stock_quantity),
      image_url: product.image_url || "",
    });
    const tiers = product.volume_pricing || [];
    setVolumeEnabled(tiers.length > 0);
    setVolumeTiers(tiers.map(t => ({ min_qty: String(t.min_qty), price: String(t.price) })));
    setShowAddDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!form.name.trim()) {
      toast({ title: "❌ Thiếu tên", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/api/products/${editingProduct.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name.trim(), sku: form.sku || null,
          price: Number(form.price) || 0, stock_quantity: Number(form.stock_quantity) || 0,
          image_url: form.image_url || null,
          volume_pricing: volumeEnabled && volumeTiers.length > 0
            ? volumeTiers.map(t => ({ min_qty: Number(t.min_qty), price: Number(t.price) })).filter(t => t.min_qty > 0 && t.price > 0)
            : null,
        }),
      });
      if (res.ok) {
        setProducts((prev) => prev.map((p) =>
          p.id === editingProduct.id
            ? { ...p, name: form.name.trim(), sku: form.sku, price: Number(form.price), stock_quantity: Number(form.stock_quantity), image_url: form.image_url,
                volume_pricing: volumeEnabled && volumeTiers.length > 0
                  ? volumeTiers.map(t => ({ min_qty: Number(t.min_qty), price: Number(t.price) })).filter(t => t.min_qty > 0 && t.price > 0)
                  : null }
            : p
        ));
        setShowAddDialog(false);
        setEditingProduct(null);
        resetForm();
        toast({ title: "✅ Cập nhật sản phẩm" });
      } else {
        const data = await res.json();
        toast({ title: "❌ Lỗi", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await authFetch(`${API_BASE}/api/products/${deleteTarget.id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast({ title: "🗑️ Đã xóa sản phẩm", description: deleteTarget.name });
    } catch (err) {
      toast({ title: "❌ Lỗi", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); setDeleteTarget(null); }
  };

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
  };

  const totalValue = products.reduce((s, p) => s + p.price * p.stock_quantity, 0);
  const outOfStock = products.filter((p) => p.stock_quantity === 0).length;
  const lowStock = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity < 10).length;

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Sản phẩm & Kho hàng</h1>
              <p className="text-xs text-zinc-500">Quản lý sản phẩm, giá bán, tồn kho</p>
            </div>
          </div>
          <button onClick={() => { resetForm(); setEditingProduct(null); setShowAddDialog(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]">
            <Plus className="w-4 h-4" /> Thêm sản phẩm
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto px-8 py-6 space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3 shadow-sm">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase">Tổng SP</div>
              <div className="text-xl font-bold text-zinc-800 mt-1">{products.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 shadow-sm">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase">Giá trị kho</div>
              <div className="text-xl font-bold text-blue-700 mt-1">{totalValue.toLocaleString("vi-VN")}đ</div>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-3 shadow-sm bg-amber-50">
              <div className="text-[10px] font-semibold text-amber-500 uppercase">Sắp hết</div>
              <div className="text-xl font-bold text-amber-700 mt-1">{lowStock}</div>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-3 shadow-sm bg-red-50">
              <div className="text-[10px] font-semibold text-red-500 uppercase">Hết hàng</div>
              <div className="text-xl font-bold text-red-700 mt-1">{outOfStock}</div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm sản phẩm theo tên hoặc SKU..."
              className="w-full px-4 py-2.5 pl-10 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 shadow-sm" />
          </div>

          {/* Product Table */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Đang tải kho hàng...
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left px-6 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-zinc-700">
                        Sản phẩm <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">SKU</th>
                    <th className="text-right px-4 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      <button onClick={() => toggleSort("price")} className="flex items-center gap-1 ml-auto hover:text-zinc-700">
                        Giá bán <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-center px-4 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      <button onClick={() => toggleSort("stock")} className="flex items-center gap-1 mx-auto hover:text-zinc-700">
                        Tồn kho <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-right px-6 py-3.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr key={product.id} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {product.image_url ? (
                              <img src={product.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                            ) : (
                              <PackageOpen className="w-5 h-5 text-zinc-400" />
                            )}
                          </div>
                          <span className="text-sm font-semibold text-zinc-800">{product.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {product.sku ? (
                          <span className="text-xs font-mono font-bold text-zinc-500 bg-zinc-100 px-2 py-1 rounded-lg">{product.sku}</span>
                        ) : (
                          <span className="text-xs text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                      <span className="text-sm font-bold text-blue-700">{product.price?.toLocaleString("vi-VN")}đ</span>
                        {product.volume_pricing && product.volume_pricing.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full">
                              <Layers className="w-2.5 h-2.5" /> {product.volume_pricing.length} mốc sỉ
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border",
                          product.stock_quantity === 0 ? "bg-red-50 text-red-700 border-red-200"
                          : product.stock_quantity < 10 ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        )}>
                          {product.stock_quantity === 0 ? "Hết hàng" : product.stock_quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEdit(product)}
                            className="p-2 rounded-lg hover:bg-blue-50 text-zinc-400 hover:text-blue-600 transition-colors">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget(product)}
                            className="p-2 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-12 text-zinc-400 text-sm">
                      {products.length === 0 ? "Chưa có sản phẩm nào. Bấm \"Thêm sản phẩm\" để bắt đầu!" : "Không tìm thấy sản phẩm"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(v) => { if (!v) { setShowAddDialog(false); setEditingProduct(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" />
              {editingProduct ? "Sửa sản phẩm" : "Thêm sản phẩm mới"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Tên sản phẩm *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Áo thun Premium Cotton"
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Mã SKU</label>
                <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="VD: AT-001"
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Giá bán (đ)</label>
                <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="299000"
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Tồn kho</label>
                <input type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} placeholder="100"
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 block mb-1.5">URL hình ảnh</label>
                <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..."
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
              </div>
            </div>

            {/* ══════ Volume Pricing (Giá sỉ) ══════ */}
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <button type="button" onClick={() => { setVolumeEnabled(!volumeEnabled); if (!volumeEnabled && volumeTiers.length === 0) setVolumeTiers([{ min_qty: '2', price: '' }]); }}
                className={cn("w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors",
                  volumeEnabled ? "bg-violet-50 border-b border-violet-200" : "bg-zinc-50 hover:bg-zinc-100")}>
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <Layers className={cn("w-4 h-4", volumeEnabled ? "text-violet-600" : "text-zinc-400")} />
                  <span className={volumeEnabled ? "text-violet-700" : "text-zinc-600"}>Giá bán buôn (Mua nhiều giảm giá)</span>
                </span>
                <div className={cn("w-8 h-4.5 rounded-full transition-colors relative",
                  volumeEnabled ? "bg-violet-500" : "bg-zinc-300")}>
                  <div className={cn("w-3.5 h-3.5 rounded-full bg-white shadow absolute top-0.5 transition-all",
                    volumeEnabled ? "left-[18px]" : "left-0.5")} />
                </div>
              </button>

              {volumeEnabled && (
                <div className="px-4 py-3 space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase">Từ SL</span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase">Giá mới (đ/sp)</span>
                    <span></span>
                  </div>
                  {volumeTiers.map((tier, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
                      <input type="number" min={2} value={tier.min_qty}
                        onChange={(e) => setVolumeTiers(prev => prev.map((t, idx) => idx === i ? { ...t, min_qty: e.target.value } : t))}
                        placeholder={i === 0 ? '2' : String(Number(volumeTiers[i-1]?.min_qty || 0) + 1)}
                        className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 text-center font-bold" />
                      <div className="relative">
                        <input type="number" min={1} value={tier.price}
                          onChange={(e) => setVolumeTiers(prev => prev.map((t, idx) => idx === i ? { ...t, price: e.target.value } : t))}
                          placeholder={form.price ? String(Math.round(Number(form.price) * 0.9)) : '0'}
                          className="w-full px-3 py-1.5 pr-5 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 text-right font-bold text-violet-700" />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400">đ</span>
                      </div>
                      <button type="button" onClick={() => setVolumeTiers(prev => prev.filter((_, idx) => idx !== i))}
                        className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => {
                    const lastQty = Number(volumeTiers[volumeTiers.length - 1]?.min_qty || 1);
                    setVolumeTiers(prev => [...prev, { min_qty: String(lastQty + 3), price: '' }]);
                  }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-dashed border-violet-300 rounded-lg transition-colors">
                    <Plus className="w-3 h-3" /> Thêm mốc giá
                  </button>
                  {/* Live preview */}
                  {Number(form.price) > 0 && volumeTiers.length > 0 && (
                    <div className="bg-zinc-50 rounded-lg px-3 py-2 space-y-0.5">
                      <p className="text-[9px] text-zinc-400 font-bold uppercase">Bảng giá</p>
                      <p className="text-[10px] text-zinc-600">1 sp: <span className="font-bold">{Number(form.price).toLocaleString('vi-VN')}đ</span></p>
                      {volumeTiers.filter(t => Number(t.min_qty) > 0 && Number(t.price) > 0).map((t, i) => {
                        const savings = Math.round((1 - Number(t.price) / Number(form.price)) * 100);
                        return (
                          <p key={i} className="text-[10px] text-violet-700">≥ {t.min_qty} sp: <span className="font-bold">{Number(t.price).toLocaleString('vi-VN')}đ</span>
                            {savings > 0 && <span className="text-emerald-600 ml-1">(-{savings}%)</span>}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={editingProduct ? handleSaveEdit : handleAdd} disabled={saving}
              className={cn("w-full py-2.5 text-sm font-bold rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2",
                saving ? "bg-zinc-300 text-zinc-500 cursor-wait" : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white")}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Đang lưu..." : editingProduct ? "Cập nhật" : "Thêm sản phẩm"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Xóa sản phẩm?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600">
            Sản phẩm <strong>&quot;{deleteTarget?.name}&quot;</strong> sẽ bị xóa vĩnh viễn khỏi kho hàng.
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setDeleteTarget(null)}
              className="flex-1 py-2 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all">Hủy</button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1">
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              {deleting ? "Đang xóa..." : "Xóa sản phẩm"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
