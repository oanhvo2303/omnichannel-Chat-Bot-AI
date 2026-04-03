"use client";

import { useState } from "react";

/**
 * ProductsModal — Modal quản lý kho sản phẩm
 */
export default function ProductsModal({ isOpen, onClose, products = [], onAdd, onUpdate, onDelete }) {
  const [form, setForm] = useState({ name: "", sku: "", price: 0, stock_quantity: 0 });
  const [editId, setEditId] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (editId) {
      onUpdate?.(editId, form);
      setEditId(null);
    } else {
      onAdd?.(form);
    }
    setForm({ name: "", sku: "", price: 0, stock_quantity: 0 });
  };

  const startEdit = (p) => {
    setEditId(p.id);
    setForm({ name: p.name, sku: p.sku || "", price: p.price, stock_quantity: p.stock_quantity });
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm({ name: "", sku: "", price: 0, stock_quantity: 0 });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold">📦 Quản lý kho hàng</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {products.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">📦</p>
              <p className="text-sm">Chưa có sản phẩm nào.</p>
              <p className="text-xs mt-1">Thêm sản phẩm bên dưới!</p>
            </div>
          )}
          <div className="space-y-2">
            {products.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 group">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{p.name}</span>
                    {p.sku && <span className="text-[10px] text-gray-400 font-mono bg-gray-200 px-1.5 rounded">{p.sku}</span>}
                  </div>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-xs text-blue-600 font-semibold">{p.price?.toLocaleString("vi-VN")}đ</span>
                    <span className={`text-xs font-medium ${p.stock_quantity > 0 ? "text-green-600" : "text-red-500"}`}>
                      Kho: {p.stock_quantity}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(p)} className="text-xs text-blue-500 hover:text-blue-700">✏️</button>
                  <button onClick={() => onDelete?.(p.id)} className="text-xs text-red-400 hover:text-red-600">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add/Edit Form */}
        <div className="px-5 py-4 border-t border-gray-100">
          {editId && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-blue-600">Đang sửa sản phẩm</span>
              <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600">Hủy</button>
            </div>
          )}
          <div className="grid grid-cols-[1fr_80px_100px_80px_auto] gap-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Tên sản phẩm" className="px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-400" />
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="SKU" className="px-2 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-400 font-mono text-center" />
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
              placeholder="Giá" className="px-2 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-400 text-right" />
            <input type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: parseInt(e.target.value) || 0 })}
              placeholder="SL" className="px-2 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-1 focus:ring-blue-400 text-center" min="0" />
            <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all whitespace-nowrap">
              {editId ? "Lưu" : "Thêm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
