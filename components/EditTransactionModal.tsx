"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { InventoryItem, TYPE_COLORS } from "@/lib/data";
import { useT } from "@/lib/i18n";
import InboundSelectModal, { InboundTx } from "@/components/InboundSelectModal";

interface LocationOption { id: number; name: string; }

interface Props {
  item: InventoryItem;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditTransactionModal({ item, onClose, onSuccess }: Props) {
  const { t } = useT();

  const [date, setDate]           = useState(item.date.replace(/\./g, "-"));
  const [type, setType]           = useState(item.type);
  const [quantity, setQuantity]   = useState(String(item.qty));
  const [unitPrice, setUnitPrice] = useState(String(item.price));
  const [currency, setCurrency]   = useState(item.currency ?? "KRW");
  const [exchangeRateAtEntry]     = useState(item.exchangeRateAtEntry);
  const [memo, setMemo]           = useState(item.memo);
  const [locationId, setLocationId]           = useState<number>(item.locationId ?? 1);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [refTxNo, setRefTxNo]                 = useState<string | null>(item.refTxNo ?? null);
  const [selectedInbound, setSelectedInbound] = useState<InboundTx | null>(null);
  const [showInboundSelect, setShowInboundSelect] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  // 마운트 시 위치 목록 로드
  useEffect(() => {
    fetch("/api/locations")
      .then(r => r.json()).then((locs: LocationOption[]) => {
        // 거래 입력용: 본사(id=1), 공덕(id=2)만 표시
        const txLocs = locs.filter(l => l.id === 1 || l.id === 2);
        setLocationOptions(txLocs.length > 0 ? txLocs : locs);
      }).catch(console.error);
  }, []);

  // 위치 변경 시 참조입고건 초기화
  const handleLocationChange = (newLocId: number) => {
    setLocationId(newLocId);
    if (newLocId !== locationId) {
      setRefTxNo(null);
      setSelectedInbound(null);
    }
  };

  const amount = currency === "USD"
    ? Number(unitPrice || 0)
    : Number(quantity || 0) * Number(unitPrice || 0);

  const handleSave = async () => {
    if (!quantity || Number(quantity) <= 0) {
      setError(t.tx.enterQty); return;
    }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/inventory?id=${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          type,
          quantity:   Number(quantity),
          unitPrice:  Number(unitPrice) || 0,
          amount,
          memo,
          locationId,
          refTxNo:    refTxNo ?? null,
          currency,
          exchangeRateAtEntry: exchangeRateAtEntry ?? null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || t.tx.editFailed); return;
      }
      onSuccess();
      onClose();
    } catch {
      setError(t.common.networkError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t.tx.editRecord}</h2>
            {item.createdAt && (
              <p className="text-xs text-gray-400 mt-0.5">
                {t.tx.createdAt}: {new Date(item.createdAt).toLocaleString("ko-KR")}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 품목명 (읽기 전용) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t.tx.itemLabel}</label>
            <input readOnly value={`${item.name} (${item.code})`}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          {/* 구분 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tx.typeLabel}</label>
            <div className="flex gap-2">
              {(["입고", "출고", "불출"] as const).map((tp) => (
                <button key={tp} onClick={() => setType(tp)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    type === tp
                      ? `${TYPE_COLORS[tp].bg} ${TYPE_COLORS[tp].text} ${TYPE_COLORS[tp].border} border-2`
                      : "bg-gray-50 text-gray-500 border-2 border-transparent"
                  }`}>{tp}</button>
              ))}
            </div>
          </div>

          {/* 날짜 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t.tx.dateLabel}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          {/* 통화 선택 */}
          <div className="flex justify-end">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["KRW", "USD"] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    currency === c
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {c === "KRW" ? "₩ KRW" : "$ USD"}
                </button>
              ))}
            </div>
          </div>
          {/* 수량 / 단가 / 금액 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t.tx.qtyLabel}</label>
              <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t.tx.unitPriceLabel}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  {currency === "USD" ? "$" : "₩"}
                </span>
                <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t.tx.amountLabel}</label>
              <input readOnly
                value={currency === "USD"
                  ? (amount ? `$${amount.toLocaleString()}` : "")
                  : (amount ? `₩${amount.toLocaleString()}` : "")}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>
          {currency === "USD" && exchangeRateAtEntry && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t.tx.entryRate}</label>
              <input readOnly value={`₩${exchangeRateAtEntry.toLocaleString()}`}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          )}

          {/* 위치 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t.tx.locationLabel}</label>
            <select
              value={locationId}
              onChange={e => handleLocationChange(Number(e.target.value))}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              {locationOptions.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          {/* 참조 입고건 — 출고/불출일 때만 표시 */}
          {(type === "출고" || type === "불출") && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {t.tx.inboundRefLabel ?? "참조 입고건"}
              </label>
              {selectedInbound ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                  <div className="flex-1 text-xs space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-700">#{selectedInbound.txNo}</span>
                      <span className="text-emerald-500">{selectedInbound.txDate}</span>
                      {selectedInbound.partnerName && (
                        <span className="text-emerald-500">· {selectedInbound.partnerName}</span>
                      )}
                    </div>
                    <p className="text-emerald-400">{t.tx.remainQty(selectedInbound.remainQty)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowInboundSelect(true)}
                    className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">
                    {t.tx.changeBtn ?? "변경"}
                  </button>
                </div>
              ) : refTxNo ? (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-blue-600 font-medium">참조: #{refTxNo}</p>
                  <button
                    type="button"
                    onClick={() => setShowInboundSelect(true)}
                    className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                    {t.tx.changeBtn ?? "변경"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowInboundSelect(true)}
                  className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors">
                  {t.tx.selectInbound ?? "참조 입고건 선택"}
                </button>
              )}
            </div>
          )}

          {/* 메모 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t.items.noteLabel}</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            {t.common.cancel}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 disabled:opacity-60">
            {saving ? t.common.saving : t.tx.editSave}
          </button>
        </div>
      </div>
      {showInboundSelect && (
        <InboundSelectModal
          isOpen={showInboundSelect}
          itemId={item.itemId}
          defaultLocationId={locationId || null}
          onSelect={(inbound: InboundTx) => {
            setSelectedInbound(inbound);
            setRefTxNo(inbound.txNo);
            setShowInboundSelect(false);
          }}
          onClose={() => setShowInboundSelect(false)}
        />
      )}
    </div>
  );
}