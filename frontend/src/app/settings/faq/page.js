'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  BookOpen, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Search, X, Check, Loader2, HelpCircle, Globe, Tag, ChevronDown,
  Sparkles, ArrowUpDown
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const authFetch = async (url, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
};

// PageMultiSelect — Tailwind light theme
function PageMultiSelect({ pages, value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const selected = value || [];
  const toggle = (id) => {
    const s = String(id);
    onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s]);
  };
  const label = selected.length === 0
    ? '🌐 Tất cả trang'
    : selected.length === 1
      ? `📄 ${pages.find(p => String(p.id) === selected[0])?.page_name || '1 trang'}`
      : `📄 ${selected.length} trang được chọn`;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 flex justify-between items-center gap-2 text-left">
        <span className={selected.length ? 'text-blue-600 font-medium' : 'text-zinc-500'}>{label}</span>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden">
          <div onClick={() => { onChange([]); setOpen(false); }}
            className={cn('px-4 py-2.5 cursor-pointer text-sm flex items-center gap-2 border-b border-zinc-100',
              selected.length === 0 ? 'bg-blue-50 text-blue-600 font-medium' : 'text-zinc-600 hover:bg-zinc-50')}>
            <Globe className="w-3.5 h-3.5" /> Tất cả trang {selected.length === 0 && <Check className="w-3.5 h-3.5 ml-auto" />}
          </div>
          {pages.map(pg => {
            const sel = selected.includes(String(pg.id));
            return (
              <div key={pg.id} onClick={() => toggle(pg.id)}
                className={cn('px-4 py-2.5 cursor-pointer text-sm flex items-center gap-2',
                  sel ? 'bg-blue-50 text-blue-600' : 'text-zinc-600 hover:bg-zinc-50')}>
                <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
                  sel ? 'bg-blue-500 border-blue-500' : 'border-zinc-300')}>
                  {sel && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                {pg.page_name || pg.page_id}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const router = useRouter();
  const [faqs, setFaqs] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [showModal, setShowModal] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [form, setForm] = useState({ question: '', answer: '', category: '', integration_ids: [] });
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/faq?sort=${sort}`);
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setFaqs(Array.isArray(data) ? data : []);
    } catch { setFaqs([]); } finally { setLoading(false); }
  }, [sort, router]);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/integrations`);
      const data = await res.json();
      setIntegrations(Array.isArray(data.integrations) ? data.integrations.filter(i => i.status === 'connected') : []);
    } catch {}
  }, []);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);
  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  const openCreate = () => {
    setEditingFaq(null);
    setForm({ question: '', answer: '', category: '', integration_ids: [] });
    setShowModal(true);
  };

  const openEdit = (faq) => {
    setEditingFaq(faq);
    let ids = [];
    try { ids = faq.integration_ids ? JSON.parse(faq.integration_ids).map(String) : []; } catch {}
    setForm({ question: faq.question, answer: faq.answer, category: faq.category || '', integration_ids: ids });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      toast({ title: '❌ Thiếu thông tin', description: 'Câu hỏi và câu trả lời là bắt buộc.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const url = editingFaq ? `${API_BASE}/api/faq/${editingFaq.id}` : `${API_BASE}/api/faq`;
      const res = await authFetch(url, {
        method: editingFaq ? 'PUT' : 'POST',
        body: JSON.stringify({ ...form, integration_ids: form.integration_ids.length > 0 ? form.integration_ids : null }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setShowModal(false);
      await fetchFaqs();
      toast({ title: editingFaq ? '✅ Đã cập nhật FAQ' : '✅ Đã thêm FAQ mới' });
    } catch (err) {
      toast({ title: '❌ Lỗi', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleToggle = async (faq) => {
    try {
      await authFetch(`${API_BASE}/api/faq/${faq.id}/toggle`, { method: 'PATCH' });
      setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, is_active: f.is_active ? 0 : 1 } : f));
    } catch {
      toast({ title: '❌ Không thể thay đổi trạng thái', variant: 'destructive' });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa FAQ này?')) return;
    try {
      await authFetch(`${API_BASE}/api/faq/${id}`, { method: 'DELETE' });
      setFaqs(prev => prev.filter(f => f.id !== id));
      toast({ title: '🗑️ Đã xóa FAQ' });
    } catch {
      toast({ title: '❌ Không thể xóa', variant: 'destructive' });
    }
  };

  const getPageNames = (idsJson) => {
    if (!idsJson) return null;
    try {
      const ids = JSON.parse(idsJson);
      if (!ids.length) return null;
      return ids.map(id => integrations.find(i => String(i.id) === String(id))?.page_name || `#${id}`).join(', ');
    } catch { return null; }
  };

  const filtered = faqs.filter(f =>
    !search || f.question.toLowerCase().includes(search.toLowerCase()) || f.answer.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const activeCount = faqs.filter(f => f.is_active).length;

  return (
    <div className="flex flex-col h-full bg-zinc-50">
      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto px-8 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-zinc-800">Dữ liệu huấn luyện AI</h1>
                <p className="text-xs text-zinc-400">FAQ ({faqs.length}) — {activeCount} đang hoạt động</p>
              </div>
            </div>
            <button id="add-faq-btn" onClick={openCreate}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Thêm FAQs
            </button>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Tổng FAQ', value: faqs.length, color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
              { label: 'Đang bật', value: activeCount, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Danh mục', value: [...new Set(faqs.map(f => f.category).filter(Boolean))].length, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
            ].map((s, i) => (
              <div key={i} className={cn('rounded-xl border p-3 shadow-sm', s.bg)}>
                <div className="text-[10px] font-semibold text-zinc-400 uppercase">{s.label}</div>
                <div className={cn('text-xl font-bold mt-1', s.color)}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input id="faq-search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Tìm kiếm câu hỏi..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300" />
            </div>
            <div className="flex bg-white border border-zinc-200 rounded-xl overflow-hidden text-sm">
              {[['newest', 'Mới nhất'], ['oldest', 'Cũ nhất']].map(([v, label]) => (
                <button key={v} onClick={() => setSort(v)}
                  className={cn('px-4 py-2.5 transition-colors font-medium',
                    sort === v ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:bg-zinc-50')}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_160px_110px] px-5 py-3 bg-zinc-50 border-b border-zinc-100">
              {['Câu hỏi', 'Trả lời', 'Trang áp dụng', 'Thao tác'].map(h => (
                <span key={h} className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">{h}</span>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
              </div>
            ) : paginated.length === 0 ? (
              <div className="text-center py-16">
                <HelpCircle className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-zinc-400">{search ? 'Không tìm thấy FAQ phù hợp' : 'Chưa có dữ liệu huấn luyện'}</p>
                {!search && (
                  <button onClick={openCreate}
                    className="mt-4 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors">
                    + Thêm FAQ đầu tiên
                  </button>
                )}
              </div>
            ) : paginated.map((faq, idx) => {
              const pageNames = getPageNames(faq.integration_ids);
              return (
                <div key={faq.id}
                  className={cn('grid grid-cols-[1fr_1fr_160px_110px] px-5 py-4 items-start gap-4',
                    idx < paginated.length - 1 && 'border-b border-zinc-100',
                    !faq.is_active && 'opacity-50')}>
                  {/* Question */}
                  <div>
                    {faq.category && (
                      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1.5">
                        <Tag className="w-2.5 h-2.5" />{faq.category}
                      </span>
                    )}
                    <p className="text-sm font-medium text-zinc-700 leading-snug">{faq.question}</p>
                  </div>
                  {/* Answer */}
                  <p className="text-sm text-zinc-500 leading-relaxed line-clamp-3">
                    {faq.answer.length > 100 ? faq.answer.substring(0, 100) + '…' : faq.answer}
                  </p>
                  {/* Page */}
                  <div>
                    {pageNames ? (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-100 px-2 py-1 rounded-lg text-[11px] font-medium">
                        <Globe className="w-3 h-3" />
                        <span className="truncate max-w-[110px]" title={pageNames}>{pageNames}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-1 rounded-lg text-[11px] font-medium">
                        <Globe className="w-3 h-3" /> Tất cả
                      </span>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button id={`faq-toggle-${faq.id}`} onClick={() => handleToggle(faq)}
                      className={cn('p-1.5 rounded-lg transition-colors', faq.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100')}
                      title={faq.is_active ? 'Tắt' : 'Bật'}>
                      {faq.is_active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                    <button id={`faq-edit-${faq.id}`} onClick={() => openEdit(faq)}
                      className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button id={`faq-delete-${faq.id}`} onClick={() => handleDelete(faq.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={cn('w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                    page === p ? 'bg-violet-600 text-white' : 'bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-50')}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Modal Add/Edit */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              {editingFaq ? 'Sửa câu hỏi FAQ' : 'Thêm câu hỏi mới'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide block mb-1.5">Danh mục (tuỳ chọn)</label>
              <input id="faq-category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                placeholder="VD: Sản phẩm, Giao hàng, Thanh toán..."
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300" />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide block mb-1.5">Áp dụng cho trang</label>
              <PageMultiSelect integrations={integrations} pages={integrations} value={form.integration_ids}
                onChange={ids => setForm(p => ({ ...p, integration_ids: ids }))} />
              <p className="text-[10px] text-zinc-400 mt-1">Để trống = áp dụng tất cả trang</p>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide block mb-1.5">Câu hỏi của khách *</label>
              <textarea id="faq-question" value={form.question} onChange={e => setForm(p => ({ ...p, question: e.target.value }))}
                placeholder="VD: Giày có bảo hành không?" rows={2}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 resize-none" />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide block mb-1.5">Câu trả lời của shop *</label>
              <textarea id="faq-answer" value={form.answer} onChange={e => setForm(p => ({ ...p, answer: e.target.value }))}
                placeholder="Dạ giày bảo hành 3 tháng lỗi nhà sản xuất ạ." rows={4}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 resize-vertical" />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-medium text-zinc-600 transition-colors">
                Huỷ
              </button>
              <button id="faq-save-btn" onClick={handleSave} disabled={saving}
                className="flex-[2] py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingFaq ? 'Cập nhật' : 'Thêm FAQ'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
