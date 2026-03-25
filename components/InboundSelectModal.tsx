"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";

export interface InboundTx {
  txNo: string;
  txDate: string;
  qty: number;
  remainQty: number;
  partnerName: string;
  locationName: string;
  memo: string;
  barcodeId: number | null;
  targetUnitId: number | null;
}

interface InboundSelectModalProps {
  isOpen: boolean;
  itemId: number | null;
  onSelect: (inbound: InboundTx) => void;
  onClose: () => void;
}

export default function InboundSelectModal({ isOpen, itemId, onSelect, onClose }: InboundSelectModalProps) {
  const [list, setList] = useState<InboundTx[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !itemId) return;
    setLoading(true);
    fetch(`/api/inventory/inbound?itemId=${itemId}`)
      .then(r => r.json())
      .then(data => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [isOpen, itemId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-sm">참조 입고 건 선택</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-blue-500" />
            </div>
          ) : list.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">선택 가능한 입고 건이 없습니다</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">전표번호</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">날짜</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">입고수량</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">잔여수량</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">거래처</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">비고</th>
                </tr>
              </thead>
              <tbody>
                {list.map(tx => (
                  <tr key={tx.txNo}
                    onClick={() => { onSelect(tx); onClose(); }}
                    className="border-t border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-mono text-blue-600 font-semibold">{tx.txNo}</td>
                    <td className="px-4 py-3 text-gray-600">{tx.txDate}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{tx.qty.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{tx.remainQty.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600">{tx.partnerName || "-"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{tx.memo || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">잔여수량이 있는 입고 건만 표시됩니다</p>
        </div>
      </div>
    </div>
  );
}
