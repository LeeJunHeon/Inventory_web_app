"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";

export interface InboundTx {
  txNo: string;
  txDate: string;
  qty: number;
  remainQty: number;
  unitPrice: number | null;
  currency: string;
  partnerName: string;
  locationName: string;
  memo: string;
  barcodeId: number | null;
  targetUnitId: number | null;
  itemCode:     string;
  itemName:     string;
  barcodeCode:  string;
}

interface InboundSelectModalProps {
  isOpen: boolean;
  itemId: number | null;
  barcodeId?: number | null;
  defaultLocationId?: number | null;
  onSelect: (inbound: InboundTx) => void;
  onClose: () => void;
}

export default function InboundSelectModal({ isOpen, itemId, barcodeId, defaultLocationId, onSelect, onClose }: InboundSelectModalProps) {
  const [list, setList] = useState<InboundTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterLocationId, setFilterLocationId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) { setFilterLocationId(null); return; }
    if (defaultLocationId !== undefined) setFilterLocationId(defaultLocationId ?? null);
    if (!itemId) return;
    setLoading(true);
    fetch(`/api/inventory/inbound?itemId=${itemId}${barcodeId ? `&barcodeId=${barcodeId}` : ""}`)
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
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
          {([
            { id: null, label: "전체" },
            { id: 1,    label: "본사" },
            { id: 2,    label: "공덕" },
          ] as { id: number | null; label: string }[]).map(loc => (
            <button
              key={String(loc.id)}
              onClick={() => setFilterLocationId(loc.id)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                filterLocationId === loc.id
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {loc.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-blue-500" />
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-gray-400">선택 가능한 입고 건이 없습니다</p>
              {filterLocationId && (
                <p className="text-xs text-amber-600 bg-amber-50 mx-4 px-3 py-2 rounded-xl">
                  {filterLocationId === 1 ? "본사" : "공덕"} 위치의 입고 건만 표시됩니다
                </p>
              )}
            </div>
          ) : list.map(tx => (
            <button key={tx.txNo}
              onClick={() => {
                const isWrongLoc = !!(defaultLocationId && tx.locationName && tx.locationName !== (defaultLocationId === 1 ? '본사' : '공덕'));
                if (isWrongLoc) return;
                onSelect(tx); onClose();
              }}
              disabled={!!(defaultLocationId && tx.locationName && tx.locationName !== (defaultLocationId === 1 ? '본사' : '공덕'))}
              className={`w-full text-left bg-white border rounded-xl px-4 py-3.5 transition-all ${
                defaultLocationId && tx.locationName && tx.locationName !== (defaultLocationId === 1 ? '본사' : '공덕')
                  ? 'border-gray-100 opacity-40 cursor-not-allowed'
                  : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/50'
              }`}>
              <div className="flex items-center justify-between gap-3">
                {/* 왼쪽 */}
                <div className="space-y-0.5 min-w-0">
                  {/* 1행: 전표번호 + 날짜 + 위치 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg group-hover:bg-blue-100 shrink-0">
                      #{tx.txNo}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">{tx.txDate}</span>
                    {tx.locationName && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                        {tx.locationName}
                      </span>
                    )}
                  </div>
                  {/* 2행: 품목명 + 거래처 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {tx.itemName && (
                      <span className="text-sm font-semibold text-gray-800 truncate">{tx.itemName}</span>
                    )}
                    {tx.partnerName && (
                      <span className="text-xs text-gray-500">{tx.partnerName}</span>
                    )}
                  </div>
                  {tx.memo && (
                    <p className="text-xs text-gray-400">📝 {tx.memo}</p>
                  )}
                </div>
                {/* 오른쪽: 단가 + 입고/잔여 */}
                <div className="flex items-center gap-3 shrink-0">
                  {tx.unitPrice != null && (
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400">단가</p>
                      <p className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                        {tx.currency === "USD"
                          ? `$${tx.unitPrice.toLocaleString()}`
                          : `₩${tx.unitPrice.toLocaleString()}`}
                      </p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400">입고</p>
                    <p className="text-xs text-gray-600 whitespace-nowrap">{tx.qty.toLocaleString()}개</p>
                  </div>
                  <div className="text-right bg-emerald-50 rounded-lg px-2 py-1">
                    <p className="text-[10px] text-emerald-600">잔여</p>
                    <p className="text-sm font-bold text-emerald-600 whitespace-nowrap">{tx.remainQty.toLocaleString()}개</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">{list.length}건 · 잔여수량이 있는 입고 건만 표시됩니다</p>
        </div>
      </div>
    </div>
  );
}
