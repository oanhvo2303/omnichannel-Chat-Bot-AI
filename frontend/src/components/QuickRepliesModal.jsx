"use client";

import { useState } from "react";

/**
 * QuickRepliesModal — Modal quản lý tin nhắn mẫu
 *
 * Props:
 *  - isOpen, onClose
 *  - quickReplies, onAdd, onDelete
 */
export default function QuickRepliesModal({ isOpen, onClose, quickReplies = [], onAdd, onDelete }) {
  const [shortcut, setShortcut] = useState("");
  const [content, setContent] = useState("");

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!shortcut.trim() || !content.trim()) return;
    onAdd?.(shortcut.trim(), content.trim());
    setShortcut("");
    setContent("");
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold">⚡ Quản lý tin nhắn mẫu</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {quickReplies.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">Chưa có tin nhắn mẫu nào.</p>
              <p className="text-xs mt-1">Thêm mới bên dưới để gõ nhanh khi chat!</p>
            </div>
          )}
          <div className="space-y-2">
            {quickReplies.map((qr) => (
              <div key={qr.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 group">
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg flex-shrink-0">
                  {qr.shortcut}
                </span>
                <span className="text-sm text-gray-700 flex-1 truncate">{qr.content}</span>
                <button
                  onClick={() => onDelete?.(qr.id)}
                  className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Add Form */}
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="flex gap-2">
            <input
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="/shortcut"
              className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-400 font-mono"
            />
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nội dung tin nhắn mẫu..."
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-400"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all"
            >
              Thêm
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            Gõ "/" trong khung chat để xem danh sách • VD: /tk → "Dạ cảm ơn anh/chị ạ!"
          </p>
        </div>
      </div>
    </div>
  );
}
