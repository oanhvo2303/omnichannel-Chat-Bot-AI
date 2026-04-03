"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tags, Plus, Trash2, Palette, Edit3, Loader2 } from "lucide-react";
import { API_BASE, authFetch } from "@/lib/api";

const presetColors = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#78716c",
];

export default function TagsSettingsPage() {
  const { toast } = useToast();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [form, setForm] = useState({ name: "", color: "#3b82f6" });

  // ─── Load tags từ API ───
  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        setTags(data.tags || data || []);
      }
    } catch (err) {
      console.error("[Tags] Lỗi tải:", err);
      toast({ title: "Lỗi", description: "Không thể tải danh sách thẻ", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ─── Tạo tag mới ───
  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/api/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), color: form.color }),
      });
      const data = await res.json();
      if (res.ok) {
        setTags((prev) => [...prev, data.tag || { id: data.id, name: form.name.trim(), color: form.color }]);
        setShowAddDialog(false);
        setForm({ name: "", color: "#3b82f6" });
        toast({ title: "🏷️ Thêm thẻ mới", description: form.name });
      } else {
        toast({ title: "Lỗi", description: data.error || "Không thể tạo thẻ", variant: "destructive" });
      }
    } catch (err) {
      console.error("[Tags] Lỗi tạo:", err);
      toast({ title: "Lỗi", description: "Không thể kết nối máy chủ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (tag) => {
    setEditingTag(tag);
    setForm({ name: tag.name, color: tag.color });
    setShowAddDialog(true);
  };

  // ─── Cập nhật tag ───
  const handleSaveEdit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/api/tags/${editingTag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), color: form.color }),
      });
      if (res.ok) {
        setTags((prev) => prev.map((t) => t.id === editingTag.id ? { ...t, name: form.name.trim(), color: form.color } : t));
        setShowAddDialog(false);
        setEditingTag(null);
        setForm({ name: "", color: "#3b82f6" });
        toast({ title: "✅ Cập nhật thẻ" });
      } else {
        const data = await res.json();
        toast({ title: "Lỗi", description: data.error || "Không thể cập nhật", variant: "destructive" });
      }
    } catch (err) {
      console.error("[Tags] Lỗi cập nhật:", err);
      toast({ title: "Lỗi", description: "Không thể kết nối máy chủ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Xóa tag ───
  const handleDelete = async (id) => {
    try {
      const res = await authFetch(`${API_BASE}/api/tags/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTags((prev) => prev.filter((t) => t.id !== id));
        toast({ title: "🗑️ Đã xóa thẻ" });
      } else {
        toast({ title: "Lỗi", description: "Không thể xóa thẻ", variant: "destructive" });
      }
    } catch (err) {
      console.error("[Tags] Lỗi xóa:", err);
      toast({ title: "Lỗi", description: "Không thể kết nối máy chủ", variant: "destructive" });
    }
  };

  return (
    <div className="h-full bg-zinc-50 flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Tags className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Quản lý Thẻ (Tags)</h1>
              <p className="text-xs text-zinc-500">Tạo và quản lý thẻ phân loại khách hàng</p>
            </div>
          </div>
          <button onClick={() => { setForm({ name: "", color: "#3b82f6" }); setEditingTag(null); setShowAddDialog(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]">
            <Plus className="w-4 h-4" /> Tạo thẻ mới
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-8 py-6 space-y-3">
          {/* Loading State */}
          {loading && (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-zinc-400" />
              <p className="text-sm text-zinc-400">Đang tải danh sách thẻ...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && tags.length === 0 && (
            <div className="text-center py-16 text-zinc-400">
              <Tags className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Chưa có thẻ nào</p>
              <p className="text-xs mt-1">Tạo thẻ để phân loại khách hàng</p>
            </div>
          )}

          {/* Tags List */}
          {!loading && tags.map((tag) => (
            <div key={tag.id} className="bg-white rounded-xl border border-zinc-200 px-5 py-4 flex items-center justify-between group hover:border-zinc-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-4">
                <div className="w-4 h-4 rounded-full shadow-inner border border-black/10" style={{ backgroundColor: tag.color }} />
                <span className="text-sm font-semibold text-zinc-800">{tag.name}</span>
                <span className="text-[9px] font-bold px-2.5 py-1 rounded-full text-white shadow-sm" style={{ backgroundColor: tag.color }}>{tag.name}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(tag)} className="p-2 rounded-lg hover:bg-blue-50 text-zinc-400 hover:text-blue-600 transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(tag.id)} className="p-2 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-pink-500" />
              {editingTag ? "Sửa thẻ" : "Tạo thẻ mới"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1.5">Tên thẻ</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: VIP, Đã mua, Wholesale..."
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-2">Màu sắc</label>
              <div className="flex flex-wrap gap-2">
                {presetColors.map((color) => (
                  <button key={color} onClick={() => setForm({ ...form, color })}
                    className={cn("w-8 h-8 rounded-xl transition-all border-2", form.color === color ? "border-zinc-800 scale-110 shadow-md" : "border-transparent hover:scale-105")}
                    style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
            {/* Preview */}
            <div className="bg-zinc-50 rounded-xl p-3 flex items-center gap-3 border border-zinc-100">
              <span className="text-xs text-zinc-500">Xem trước:</span>
              <span className="text-[10px] font-bold px-3 py-1 rounded-full text-white shadow-sm" style={{ backgroundColor: form.color }}>
                {form.name || "Tên thẻ"}
              </span>
            </div>
            <button onClick={editingTag ? handleSaveEdit : handleAdd} disabled={saving || !form.name.trim()}
              className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50">
              {saving ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Đang lưu...</span>
              ) : (
                editingTag ? "Cập nhật" : "Tạo thẻ"
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
