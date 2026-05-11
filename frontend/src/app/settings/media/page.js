'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import {
  Images, Upload, Copy, Trash2, Search, X, Check,
  Loader2, ImageIcon, Video, FileImage, ExternalLink, RefreshCw,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const authFetch = async (url, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
};

// ─── Helpers ─────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getMimeIcon(mimetype) {
  if (!mimetype) return <FileImage className="w-5 h-5 text-zinc-400" />;
  if (mimetype.startsWith('video/')) return <Video className="w-5 h-5 text-purple-400" />;
  return <ImageIcon className="w-5 h-5 text-blue-400" />;
}

// ─── UploadZone ──────────────────────────────────────────────
function UploadZone({ onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let success = 0, failed = 0;

    for (const file of files) {
      const fd = new FormData();
      fd.append('media', file);
      try {
        const res = await authFetch(`${API_BASE}/api/upload`, { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok) success++;
        else { failed++; console.warn('[UPLOAD]', data.error); }
      } catch (e) {
        failed++;
        console.error('[UPLOAD]', e.message);
      }
    }

    setUploading(false);
    if (success > 0) {
      toast({ title: `✅ Đã upload ${success} file`, description: failed > 0 ? `${failed} file lỗi` : undefined });
      onUploaded();
    } else {
      toast({ title: 'Upload thất bại', description: 'Kiểm tra định dạng file (JPG/PNG/GIF/WEBP/MP4)', variant: 'destructive' });
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`
        relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed
        cursor-pointer transition-all select-none min-h-[140px]
        ${dragging
          ? 'border-blue-400 bg-blue-50 scale-[1.01]'
          : 'border-zinc-200 bg-zinc-50/60 hover:border-blue-300 hover:bg-blue-50/40'
        }
      `}
    >
      <input ref={inputRef} type="file" multiple accept="image/*,video/mp4,video/webm"
        className="hidden" onChange={(e) => uploadFiles(Array.from(e.target.files))} />

      {uploading ? (
        <>
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-blue-600 font-medium">Đang upload...</p>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <Upload className="w-6 h-6 text-blue-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-700">Kéo & thả hoặc click để upload</p>
            <p className="text-xs text-zinc-400 mt-0.5">JPG, PNG, GIF, WEBP, MP4 — tối đa 10MB/file</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── MediaCard ────────────────────────────────────────────────
function MediaCard({ item, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isVideo = item.mimetype?.startsWith('video/');

  const copyUrl = () => {
    navigator.clipboard.writeText(item.url).then(() => {
      setCopied(true);
      toast({ title: '✅ Đã copy URL', description: 'Dán vào ô câu trả lời FAQ làm link ảnh AI' });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDelete = async () => {
    if (!confirm('Xóa ảnh này? Hành động không thể hoàn tác.')) return;
    setDeleting(true);
    try {
      const res = await authFetch(`${API_BASE}/api/upload/library/${item.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Đã xóa', description: item.filename });
        onDelete(item.id);
      } else {
        const d = await res.json();
        toast({ title: 'Lỗi xóa', description: d.error, variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Lỗi mạng', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="group relative bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200">
      {/* Thumbnail */}
      <div className="relative aspect-square bg-zinc-100 overflow-hidden">
        {isVideo ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-zinc-900/5">
            <Video className="w-10 h-10 text-purple-400" />
            <span className="text-xs text-zinc-500 font-medium">Video</span>
          </div>
        ) : imgError ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <FileImage className="w-10 h-10 text-zinc-300" />
            <span className="text-xs text-zinc-400">Preview lỗi</span>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.url}
            alt={item.filename}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={copyUrl}
            className="w-9 h-9 rounded-xl bg-white/95 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
            title="Copy URL"
          >
            {copied
              ? <Check className="w-4 h-4 text-green-500" />
              : <Copy className="w-4 h-4 text-blue-600" />
            }
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 rounded-xl bg-white/95 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
            title="Mở tab mới"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-4 h-4 text-zinc-600" />
          </a>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-9 h-9 rounded-xl bg-white/95 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
            title="Xóa"
          >
            {deleting
              ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              : <Trash2 className="w-4 h-4 text-red-500" />
            }
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-zinc-100">
        <p className="text-xs font-medium text-zinc-700 truncate" title={item.filename}>
          {item.filename}
        </p>
        <div className="flex items-center justify-between mt-1 gap-1">
          <span className="text-[10px] text-zinc-400">{formatSize(item.size)}</span>
          <button
            onClick={copyUrl}
            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md transition-all ${
              copied
                ? 'bg-green-100 text-green-600'
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
            }`}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function MediaLibraryPage() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all'); // all | image | video

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/upload/library`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      toast({ title: 'Lỗi tải thư viện', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  const handleDelete = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const filtered = items.filter(item => {
    const matchSearch = !search || item.filename.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all'
      || (filter === 'image' && item.mimetype?.startsWith('image/'))
      || (filter === 'video' && item.mimetype?.startsWith('video/'));
    return matchSearch && matchFilter;
  });

  const imageCount = items.filter(i => i.mimetype?.startsWith('image/')).length;
  const videoCount = items.filter(i => i.mimetype?.startsWith('video/')).length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-md">
            <Images className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Thư viện Ảnh & Video</h1>
            <p className="text-xs text-zinc-500">
              {items.length} file · {imageCount} ảnh · {videoCount} video
            </p>
          </div>
        </div>
        <button
          onClick={fetchLibrary}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 bg-white border border-zinc-200 rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Upload Zone */}
      <UploadZone onUploaded={fetchLibrary} />

      {/* Tip box */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <span className="text-lg">💡</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">Cách dùng URL ảnh làm kiến thức AI</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Upload ảnh → <strong>Copy URL</strong> → Dán vào ô <em>Câu trả lời</em> trong tab FAQ.
            AI sẽ gửi link ảnh này cho khách khi được hỏi đúng câu hỏi tương ứng.
          </p>
        </div>
      </div>

      {/* Filter + Search bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter pills */}
        {[
          { key: 'all',   label: `Tất cả (${items.length})` },
          { key: 'image', label: `Ảnh (${imageCount})` },
          { key: 'video', label: `Video (${videoCount})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-zinc-600 border border-zinc-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {f.label}
          </button>
        ))}

        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Tìm tên file..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-zinc-500">Đang tải thư viện...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center">
            <Images className="w-8 h-8 text-zinc-300" />
          </div>
          <p className="text-sm font-medium text-zinc-500">
            {search || filter !== 'all' ? 'Không tìm thấy file phù hợp' : 'Chưa có file nào — hãy upload ảnh đầu tiên!'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">
            Hiển thị {filtered.length}/{items.length} file
            {(search || filter !== 'all') && ' (đang lọc)'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map(item => (
              <MediaCard key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
