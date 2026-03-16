"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { InventoryItem, TYPE_COLORS } from "@/lib/data";

interface Props {
  item: InventoryItem;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditTransactionModal({ item, onClose, onSuccess }: Props) {
  const [date, setDate]           = useState(item.date.replace(/\./g, "-"));
  const [type, setType]           = useState(item.type);
  const [quantity, setQuantity]   = useState(String(item.qty));
  const [unitPrice, setUnitPrice] = useState(String(item.price));
  const [memo, setMemo]           = useState(item.memo);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const amount = Number(quantity || 0) * Number(unitPrice || 0);

  const handleSave = async () => {
    if (!quantity || Number(quantity) <= 0) {
      setError("수량을 입력해주세요."); return;
    }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/inventory?id=${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          type,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice) || 0,
          amount,
          memo,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "수정 실패"); return;
      }
      onSuccess();
      onClose();
    } catch {
      setError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">기록 수정</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 품목명 (읽기 전용) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">품목</label>
            <input readOnly value={`${item.name} (${item.code})`}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          {/* 구분 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">구분</label>
            <div className="flex gap-2">
              {(["입고", "출고", "불출"] as const).map((t) => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    type === t
                      ? `${TYPE_COLORS[t].bg} ${TYPE_COLORS[t].text} ${TYPE_COLORS[t].border} border-2`
                      : "bg-gray-50 text-gray-500 border-2 border-transparent"
                  }`}>{t}</button>
              ))}
            </div>
          </div>

          {/* 날짜 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">날짜</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          {/* 수량 / 단가 / 금액 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">수량</label>
              <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">단가</label>
              <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">금액</label>
              <input readOnly value={amount ? `₩${amount.toLocaleString()}` : ""}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">비고</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            취소
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 disabled:opacity-60">
            {saving ? "저장 중..." : "수정 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}