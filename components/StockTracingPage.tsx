"use client";

import { useState } from "react";
import { Search, ArrowDownCircle, ArrowUpCircle, Share2, ChevronRight, Loader2, Tag, X } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/data";

interface BarcodeInfo  { id: number; code: string; isActive: string; }
interface TxCount      { inbound: number; outbound: number; disburse: number; }
interface SearchResult {
  itemId: number; itemCode: string; itemName: string; category: string;
  barcodes: BarcodeInfo[]; txCount: TxCount; currentQty: number;
}

interface TxRecord {
  id: number; txType: string; txNo: string | null; refTxNo: string | null;
  txDate: string; qty: number; unitPrice: number | null; currency: string;
  memo: string; partnerName: string; barcodeCode: string; locationName: string;
  reasonName: string; userName: string;
}

const TYPE_STYLE: Record<string, string> = {
  "입고": "bg-blue-50 text-blue-700 border-blue-200",
  "출고": "bg-rose-50 text-rose-700 border-rose-200",
  "불출": "bg-amber-50 text-amber-700 border-amber-200",
};

const TYPE_DOT: Record<string, string> = {
  "입고": "bg-blue-500",
  "출고": "bg-rose-500",
  "불출": "bg-amber-500",
};

export default function StockTracingPage() {
  const [query, setQuery]                   = useState("");
  const [searchType, setSearchType]         = useState("전체");
  const [results, setResults]               = useState<SearchResult[]>([]);
  const [selectedItem, setSelectedItem]     = useState<SearchResult | null>(null);
  const [selectedBarcodeId, setSelectedBarcodeId] = useState<number | null>(null);
  const [txHistory, setTxHistory]           = useState<TxRecord[]>([]);
  const [loading, setLoading]               = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searched, setSearched]             = useState(false);
  const [selectedTx, setSelectedTx]         = useState<TxRecord | null>(null);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSelectedItem(null);
    setTxHistory([]);
    setSearched(true);
    try {
      const res = await fetch(`/api/inventory/trace?query=${encodeURIComponent(q)}&searchType=${encodeURIComponent(searchType)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = async (item: SearchResult, barcodeId: number | null = null) => {
    setSelectedItem(item);
    setSelectedBarcodeId(barcodeId);
    setHistoryLoading(true);
    try {
      const url = `/api/inventory/trace/${item.itemId}${barcodeId ? `?barcodeId=${barcodeId}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setTxHistory(Array.isArray(data) ? data : []);
    } catch {
      setTxHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleBarcodeFilter = (barcodeId: number | null) => {
    if (!selectedItem) return;
    handleSelectItem(selectedItem, barcodeId);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">재고 추적</h1>
        <p className="text-sm text-gray-500 mt-1">품목코드, 품목명, 바코드로 입출고 전체 이력을 추적합니다</p>
      </div>

      {/* 검색창 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex gap-2">
          <select
            value={searchType}
            onChange={e => setSearchType(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shrink-0"
          >
            <option value="전체">전체</option>
            <option value="품목코드">품목코드</option>
            <option value="품목명">품목명</option>
            <option value="바코드">바코드</option>
          </select>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="품목코드, 품목명, 바코드 입력 (예: T-1, VO2, Vanadium)"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60 flex items-center gap-2"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            검색
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        {/* 검색 결과 목록 */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-gray-100">
              <Loader2 size={22} className="animate-spin text-blue-500" />
            </div>
          ) : !searched ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 space-y-2">
              <Search size={28} className="text-gray-200" />
              <p className="text-sm text-gray-400">검색어를 입력하고 검색하세요</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 space-y-2">
              <Search size={28} className="text-gray-200" />
              <p className="text-sm text-gray-500 font-medium">검색 결과 없음</p>
              <p className="text-xs text-gray-400">다른 검색어 또는 검색 기준을 사용해보세요</p>
            </div>
          ) : results.map(item => (
            <button
              key={item.itemId}
              onClick={() => handleSelectItem(
                item,
                searchType === "바코드" && item.barcodes.length === 1
                  ? item.barcodes[0].id
                  : null
              )}
              className={`w-full text-left bg-white rounded-2xl border transition-all p-4 space-y-3 hover:border-blue-400 hover:shadow-sm ${
                selectedItem?.itemId === item.itemId ? "border-blue-500 shadow-sm ring-1 ring-blue-200" : "border-gray-100"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.itemName}</p>
                  <p className="text-xs font-mono text-gray-500 mt-0.5">{item.itemCode}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || "bg-gray-100 text-gray-600"}`}>
                    {item.category}
                  </span>
                  <ChevronRight size={14} className="text-gray-300" />
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-blue-600">
                  <ArrowDownCircle size={12} />입고 {item.txCount.inbound}건
                </span>
                <span className="flex items-center gap-1 text-rose-500">
                  <ArrowUpCircle size={12} />출고 {item.txCount.outbound}건
                </span>
                <span className="flex items-center gap-1 text-amber-600">
                  <Share2 size={12} />불출 {item.txCount.disburse}건
                </span>
                <span className="ml-auto font-semibold text-emerald-700">
                  재고 {item.currentQty}개
                </span>
              </div>

              {item.barcodes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.barcodes.slice(0, 5).map(b => (
                    <span key={b.id} className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                      <Tag size={9} />{b.code}
                    </span>
                  ))}
                  {item.barcodes.length > 5 && (
                    <span className="text-[10px] text-gray-400 px-1.5 py-0.5">+{item.barcodes.length - 5}개</span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* 상세 이력 */}
        <div className="lg:col-span-3">
          {!selectedItem ? (
            <div className="flex items-center justify-center py-24 bg-white rounded-2xl border border-gray-100">
              <div className="text-center space-y-2">
                <Search size={28} className="text-gray-200 mx-auto" />
                <p className="text-sm text-gray-400">품목을 검색하고 선택하면<br />입출고 이력이 표시됩니다</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {/* 헤더 */}
              <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                <div>
                  <p className="text-base font-bold text-gray-900">{selectedItem.itemName}</p>
                  <p className="text-xs font-mono text-gray-400">{selectedItem.itemCode}</p>
                </div>
                {/* 바코드 필터 */}
                {selectedItem.barcodes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => handleBarcodeFilter(null)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        selectedBarcodeId === null
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                      }`}
                    >
                      전체
                    </button>
                    {selectedItem.barcodes.map(b => (
                      <button
                        key={b.id}
                        onClick={() => handleBarcodeFilter(b.id)}
                        className={`text-xs font-mono px-2.5 py-1 rounded-full border transition-colors ${
                          selectedBarcodeId === b.id
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                        }`}
                      >
                        {b.code}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 이력 타임라인 */}
              {historyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-blue-500" />
                </div>
              ) : txHistory.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm text-gray-400">거래 이력이 없습니다</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">날짜</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">구분</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">전표번호</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">거래처/사유</th>
                        <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">수량</th>
                        <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">단가</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">바코드</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txHistory.map(tx => (
                        <tr key={tx.id} onClick={() => setSelectedTx(tx)} className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{tx.txDate}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg border ${TYPE_STYLE[tx.txType] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[tx.txType] ?? "bg-gray-400"}`} />
                              {tx.txType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-600 whitespace-nowrap">
                            {tx.txNo ? `#${tx.txNo}` : "-"}
                            {tx.refTxNo && <span className="text-gray-400 ml-1">↳{tx.refTxNo}</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700 max-w-[160px] truncate">
                            {tx.partnerName || tx.reasonName || tx.memo || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-right whitespace-nowrap">
                            <span className={tx.txType === "입고" ? "text-blue-600" : "text-rose-600"}>
                              {tx.txType === "입고" ? "+" : "-"}{tx.qty.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-right text-gray-600 whitespace-nowrap">
                            {tx.unitPrice != null
                              ? tx.currency === "USD"
                                ? `$${tx.unitPrice.toLocaleString()}`
                                : `₩${tx.unitPrice.toLocaleString()}`
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400 whitespace-nowrap">
                            {tx.barcodeCode || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 요약 */}
              {txHistory.length > 0 && (
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 text-xs text-gray-500">
                  <span>전체 {txHistory.length}건</span>
                  <span className="text-blue-600">입고 {txHistory.filter(t => t.txType === "입고").reduce((s, t) => s + t.qty, 0).toLocaleString()}</span>
                  <span className="text-rose-500">출고 {txHistory.filter(t => t.txType === "출고").reduce((s, t) => s + t.qty, 0).toLocaleString()}</span>
                  <span className="text-amber-600">불출 {txHistory.filter(t => t.txType === "불출").reduce((s, t) => s + t.qty, 0).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* 거래 상세 팝업 */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedTx(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${TYPE_STYLE[selectedTx.txType] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[selectedTx.txType] ?? "bg-gray-400"}`} />
                  {selectedTx.txType}
                </span>
                <span className="text-sm font-semibold text-gray-800">{selectedTx.txDate}</span>
              </div>
              <button onClick={() => setSelectedTx(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="divide-y divide-gray-100 text-sm">
              {[
                { label: "전표번호", value: selectedTx.txNo ? `#${selectedTx.txNo}` : "-" },
                { label: "참조전표", value: selectedTx.refTxNo || "-" },
                { label: "수량",     value: `${selectedTx.txType === "입고" ? "+" : "-"}${selectedTx.qty.toLocaleString()}` },
                { label: "단가",     value: selectedTx.unitPrice != null ? (selectedTx.currency === "USD" ? `$${selectedTx.unitPrice.toLocaleString()}` : `₩${selectedTx.unitPrice.toLocaleString()}`) : "-" },
                { label: "거래처",   value: selectedTx.partnerName || "-" },
                { label: "사유",     value: selectedTx.reasonName || "-" },
                { label: "위치",     value: selectedTx.locationName || "-" },
                { label: "바코드",   value: selectedTx.barcodeCode || "-" },
                { label: "담당자",   value: selectedTx.userName || "-" },
                { label: "메모",     value: selectedTx.memo || "-" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start py-2 gap-3">
                  <span className="w-20 text-xs text-gray-400 shrink-0 pt-0.5">{label}</span>
                  <span className="text-gray-800 font-mono text-xs break-all">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
