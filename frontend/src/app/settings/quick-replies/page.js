"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Zap, Save, Loader2, Image as ImageIcon, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function QuickRepliesSettings() {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReply, setEditingReply] = useState(null);
  const [formData, setFormData] = useState({ shortcut: "", content: "", image_url: "" });
  const [isSaving, setIsSaving] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchReplies();
  }, []);

  const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem("token");
    if (!token) { window.location.href = "/login"; return null; }
    options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
    const res = await fetch(url, options);
    if (res.status === 401) window.location.href = "/login";
    return res;
  };

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/quick-replies`);
      if (res?.ok) {
        const data = await res.json();
        setReplies(data);
      }
    } catch {
      toast({ title: "Lỗi kết nối", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingReply(null);
    setFormData({ shortcut: "", content: "", image_url: "" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (reply) => {
    setEditingReply(reply);
    setFormData({ shortcut: reply.shortcut.replace("/", ""), content: reply.content, image_url: reply.image_url || "" });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.shortcut.trim() || !formData.content.trim()) {
      return toast({ title: "Vui lòng nhập Phím tắt và Nội dung", variant: "destructive" });
    }

    setIsSaving(true);
    try {
      const isEdit = !!editingReply;
      const url = isEdit ? `${API_BASE}/api/quick-replies/${editingReply.id}` : `${API_BASE}/api/quick-replies`;
      const method = isEdit ? "PUT" : "POST";

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortcut: formData.shortcut,
          content: formData.content,
          image_url: formData.image_url || null
        }),
      });

      if (res?.ok) {
        toast({ title: isEdit ? "Cập nhật thành công!" : "Tạo mẫu tin thành công!" });
        setIsDialogOpen(false);
        fetchReplies();
      } else {
        const data = await res.json();
        toast({ title: "Lỗi", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Đã có lỗi xảy ra", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Bạn có chắc chắn muốn xóa mẫu tin này?")) return;
    try {
      const res = await authFetch(`${API_BASE}/api/quick-replies/${id}`, { method: "DELETE" });
      if (res?.ok) {
        toast({ title: "Đã xóa mẫu tin!" });
        fetchReplies();
      }
    } catch {
      toast({ title: "Xóa thất bại", variant: "destructive" });
    }
  };

  const handleUploadImage = async (file) => {
    if (!file) return;
    setIsUploading(true);
    const formDataUpload = new FormData();
    formDataUpload.append("file", file);

    try {
      const res = await authFetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formDataUpload, // Không tự set Content-Type với FormData
      });
      if (res?.ok) {
        const data = await res.json();
        setFormData(p => ({ ...p, image_url: data.url }));
        toast({ title: "Tải ảnh lên thành công!" });
      } else {
        toast({ title: "Lỗi tải ảnh", variant: "destructive" });
      }
    } catch {
      toast({ title: "Đã có lỗi xảy ra", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const filteredReplies = replies.filter(r => 
    r.shortcut.toLowerCase().includes(search.toLowerCase()) || 
    r.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-blue-500" />
            Tin nhắn Mẫu
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Tạo các câu trả lời soạn sẵn. Gõ <code className="bg-zinc-100 px-1 rounded mx-1 text-blue-600 font-bold">/</code> trong khung chat để gọi phím tắt.
          </p>
        </div>
        <button onClick={handleOpenAdd} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> Thêm Mẫu Mới
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-4 items-center bg-white p-2 rounded-xl border border-zinc-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input type="text" placeholder="Tìm kiếm phím tắt, nội dung..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-transparent border-none outline-none focus:ring-0 placeholder:text-zinc-400" />
        </div>
      </div>

      {/* Table List */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-sm font-medium">Đang tải danh sách...</span>
          </div>
        ) : filteredReplies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 px-4 text-center">
            <Zap className="w-12 h-12 mb-3 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">Chưa có tin nhắn mẫu nào</p>
            <p className="text-xs mt-1">Bấm "Thêm Mẫu Mới" để tạo các câu trả lời thường xuyên sử dụng.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-50 border-b border-zinc-200/80 text-zinc-500">
                <tr>
                  <th className="px-5 py-3.5 font-semibold w-1/4">Phím tắt</th>
                  <th className="px-5 py-3.5 font-semibold w-[45%]">Nội dung trả lời</th>
                  <th className="px-5 py-3.5 font-semibold w-1/4">Tệp đính kèm</th>
                  <th className="px-5 py-3.5 font-semibold text-right w-16">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredReplies.map((reply) => (
                  <tr key={reply.id} className="hover:bg-blue-50/50 transition-colors group">
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded bg-blue-50 text-blue-700 font-mono font-bold text-xs ring-1 ring-inset ring-blue-700/10">
                        {reply.shortcut}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-600 whitespace-normal min-w-[300px]">
                      <p className="line-clamp-2 leading-relaxed whitespace-pre-wrap">{reply.content}</p>
                    </td>
                    <td className="px-5 py-4">
                      {reply.image_url ? (
                        <div className="flex items-center gap-2">
                          <img src={reply.image_url} alt="đính kèm" className="w-10 h-10 object-cover rounded-md border border-zinc-200 shadow-sm" />
                          <span className="text-xs text-zinc-500 font-medium">Đã có ảnh</span>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 italic">Không có</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleOpenEdit(reply)} className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Sửa">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(reply.id)} className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl bg-white p-0 overflow-hidden border-0 shadow-2xl rounded-2xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100">
            <DialogTitle className="text-xl flex items-center gap-2 font-bold text-zinc-800">
              <Zap className="w-5 h-5 text-blue-500" />
              {editingReply ? "Chỉnh sửa tin nhắn mẫu" : "Thêm tin nhắn mẫu mới"}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 mt-1">
              Bạn có thể sử dụng biến <code className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-xs font-bold">{"{name}"}</code> trong nội dung. Hệ thống sẽ đổi thành tên khách.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-900 block">Phím tắt (Shortcut)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono font-bold">/</span>
                <input type="text" value={formData.shortcut} onChange={(e) => setFormData({ ...formData, shortcut: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })}
                  placeholder="gia, stk, diachi..." autoFocus
                  className="w-full pl-7 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none transition-all" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-900 block">Nội dung trả lời</label>
              <textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Dạ chào {name}, mẫu này còn hạn ạ..." rows={6}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none transition-all resize-none leading-relaxed" />
              <div className="flex gap-2 text-xs font-medium mt-1">
                <span className="text-zinc-500">Mẫu gợi ý:</span>
                <button onClick={() => setFormData(p => ({...p, content: p.content + " {name}"}))} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 rounded transition-colors tracking-wide">Thêm {"{name}"}</button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-900 block flex items-center justify-between">
                <span>Ảnh đính kèm (Tùy chọn)</span>
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {formData.image_url && (
                  <div className="relative group w-24 h-24 shrink-0">
                    <img src={formData.image_url} alt="Mẫu ảnh" className="w-full h-full object-cover rounded-xl border border-zinc-200 shadow-sm" />
                    <button onClick={() => setFormData({...formData, image_url: ""})} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                
                <div className="flex-1 w-full relative h-[6rem]">
                  <input type="file" id="media-upload-qr" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                       if (e.target.files && e.target.files[0]) {
                          handleUploadImage(e.target.files[0]);
                       }
                    }} />
                  <label htmlFor="media-upload-qr" className="flex flex-col items-center justify-center w-full h-full border-2 border-dashed border-zinc-300 hover:border-blue-400 hover:bg-blue-50/50 rounded-xl text-sm font-medium text-zinc-600 transition-all cursor-pointer">
                    {isUploading ? (
                      <><Loader2 className="w-6 h-6 animate-spin mb-1 text-blue-500" /> <span className="text-xs">Đang tải lên...</span></>
                    ) : (
                      <><ImageIcon className="w-6 h-6 mb-1 text-zinc-400 group-hover:text-blue-500" /> <span className="text-xs">Bấm để chọn ảnh từ thiết bị</span></>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row items-center justify-end gap-2">
            <button onClick={() => setIsDialogOpen(false)} disabled={isSaving} className="w-full sm:w-auto px-4 py-2.5 text-zinc-600 font-semibold hover:bg-zinc-200/50 rounded-xl transition-colors shrink-0 outline-none">
              Hủy
            </button>
            <button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-colors shrink-0">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingReply ? "Cập nhật" : "Lưu mẫu tin"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
