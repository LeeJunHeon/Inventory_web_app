"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Download, Edit, Trash2, ArrowUpDown, ArrowDown, ArrowUp, ChevronDown, Loader2 } from "lucide-react";
import { CATEGORIES, TYPES, TYPE_COLORS, CATEGORY_COLORS, formatPrice, formatQty, InventoryItem } from "@/lib/data";
import TransactionModal     from "./TransactionModal";
import EditTransactionModal from "./EditTransactionModal";

// ── CSV 다운로드 헬퍼 ──────────────────────────────────
function downloadCSV(data: InventoryItem[], filename: string) {
  const headers = ["전표번호", "ID", "날짜", "구분", "품목군", "품목코드", "품목명", "수량", "단가", "금액", "거래처", "등록자", "바코드", "메모"];
  const rows = data.map(i => [
    i.txNo || "", i.id, i.date, i.type, i.category, i.code, i.name,
    i.qty, i.price, i.amount, i.partner, i.userName ?? "", i.barcode, i.memo,
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Korean Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const SEARCH_FIELDS = ["전체", "품목명", "품목코드", "바코드", "거래처"];

export default function InventoryPage() {
  const [items, setItems]               = useState<InventoryItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [searchField, setSearchField]   = useState("전체");
  const [typeFilter, setTypeFilter]     = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [modalOpen, setModalOpen]       = useState(false);
  const [sortField, setSortField]       = useState("date");
  const [sortDir, setSortDir]           = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters]   = useState(false);
  const [editItem, setEditItem]         = useState<InventoryItem | null>(null);
  const [toast, setToast]               = useState("");
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [page, setPage]                 = useState(1);
  const [limit, setLimit]               = useState(50);
  const [total, setTotal]               = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)               params.set("search", search);
      if (search && searchField !== "전체") params.set("searchField", searchField);
      if (typeFilter !== "전체")    params.set("type", typeFilter);
      if (categoryFilter !== "전체") params.set("category", categoryFilter);
      params.set("page",      String(page));
      params.set("limit",     String(limit));
      params.set("sortField", sortField);
      params.set("sortDir",   sortDir);
      const res = await fetch(`/api/inventory?${params}`);
      if (!res.ok) throw new Error("조회 실패");
      const json = await res.json();
      setItems(json.data);
      setTotal(json.total);
    } catch { setToast("데이터 조회에 실패했습니다."); setTimeout(() => setToast(""), 3000); }
    finally { setLoading(false); }
  }, [search, searchField, typeFilter, categoryFilter, page, limit, sortField, sortDir]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  useEffect(() => {
    fetch("/api/exchange-rate")
      .then(r => r.json())
      .then(data => setExchangeRate(data.rate))
      .catch(() => setExchangeRate(1400));
  }, []);

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
    setPage(1);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/inventory?id=${id}`, { method: "DELETE" });
      if (res.ok) { fetchData(); setToast("삭제되었습니다."); setTimeout(() => setToast(""), 3000); }
      else { const d = await res.json(); setToast(d.error || "삭제 실패"); setTimeout(() => setToast(""), 3000); }
    } catch { setToast("네트워크 오류"); setTimeout(() => setToast(""), 3000); }
  };

  // ── CSV 내보내기 ──────────────────────────────────────
  const handleExport = () => {
    if (items.length === 0) { setToast("내보낼 데이터가 없습니다."); setTimeout(() => setToast(""), 3000); return; }
    const now      = new Date();
    const dateStr  = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
    const filename = `재고내역_${dateStr}.csv`;
    downloadCSV(items, filename);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-gray-300" />;
    return sortDir === "asc" ? <ArrowUp size={14} className="text-blue-500" /> : <ArrowDown size={14} className="text-blue-500" />;
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">재고 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">입고 / 출고 / 불출 기록을 관리합니다</p>
        </div>
        <div className="flex gap-2">
          {/* ✅ 내보내기 버튼 — CSV 다운로드 */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            <Download size={16} /><span className="hidden sm:inline">내보내기</span>
          </button>
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 shadow-sm">
            <Plus size={16} />새 기록
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1 flex gap-2">
            <select value={searchField} onChange={e => { setSearchField(e.target.value); setSearch(""); setPage(1); }}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 shrink-0 text-gray-600">
              {SEARCH_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text"
                placeholder={searchField === "전체" ? "품목명, 품목코드, 바코드, 거래처 검색..." :
                  searchField === "바코드" ? "바코드 정확히 입력 (예: T-3)" :
                  `${searchField} 검색...`}
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden flex items-center gap-1 px-3 py-2.5 bg-gray-50 text-gray-600 rounded-xl text-sm font-medium">
            필터 <ChevronDown size={14} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
        </div>
        <div className={`flex-wrap gap-2 ${showFilters ? "flex" : "hidden"} sm:flex`}>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            {TYPES.map((t) => (
              <button key={t} onClick={() => { setTypeFilter(t); setPage(1); }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${typeFilter === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{t}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 overflow-x-auto">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => { setCategoryFilter(c); setPage(1); }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${categoryFilter === c ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={24} className="animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500">로딩 중...</span>
        </div>
      ) : (
        <>
          {/* 데스크탑 테이블 */}
          <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">전표번호</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("id")}><div className="flex items-center gap-1">ID <SortIcon field="id" /></div></th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("date")}><div className="flex items-center gap-1">날짜 <SortIcon field="date" /></div></th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">구분</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목군</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">바코드</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목</th>
                    <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("qty")}><div className="flex items-center justify-end gap-1">수량 <SortIcon field="qty" /></div></th>
                    <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("amount")}><div className="flex items-center justify-end gap-1">금액 <SortIcon field="amount" /></div></th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">거래처</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">등록자</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={12} className="px-5 py-12 text-center text-sm text-gray-400">데이터가 없습니다</td></tr>
                  ) : items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors group">
                      <td className="px-4 py-3.5 text-sm font-mono font-semibold text-gray-700">{item.txNo || "-"}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 font-mono">{item.id}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{item.date}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ${TYPE_COLORS[item.type]?.bg} ${TYPE_COLORS[item.type]?.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${TYPE_COLORS[item.type]?.dot}`} />{item.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5"><span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${CATEGORY_COLORS[item.category] || ""}`}>{item.category}</span></td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 font-mono">{item.barcode || "-"}</td>
                      <td className="px-5 py-3.5" title={item.itemSpec ?? undefined}>
                        <p className="text-sm font-medium text-gray-900">
                          {item.name}
                          {item.itemSpec && <span className="ml-1.5 text-[10px] text-violet-400 font-normal">ℹ</span>}
                        </p>
                        <p className="text-xs text-gray-400">{item.code}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-right font-semibold text-gray-900">{formatQty(item.qty)}</td>
                      <td className="px-5 py-3.5 text-sm text-right text-gray-600">
                        {item.currency === "USD" ? (
                          <div>
                            <p className="text-gray-600">
                              {item.amount != null ? `$${item.amount.toLocaleString()}` : "-"}
                            </p>
                            {item.exchangeRateAtEntry && item.amount != null && (
                              <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
                                등록시 ₩{Math.round(item.amount * item.exchangeRateAtEntry).toLocaleString()} ({item.exchangeRateAtEntry.toLocaleString()}원)
                              </p>
                            )}
                            {exchangeRate && item.amount != null && (
                              <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
                                현재 ₩{Math.round(item.amount * exchangeRate).toLocaleString()} ({exchangeRate.toLocaleString()}원)
                              </p>
                            )}
                          </div>
                        ) : (
                          formatPrice(item.amount)
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{item.partner}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{item.userName ?? "-"}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditItem(item)} className="p-1.5 rounded-lg hover:bg-blue-100 text-gray-400 hover:text-blue-600" title="수정"><Edit size={15} /></button>
                          <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-rose-100 text-gray-400 hover:text-rose-600" title="삭제"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-500">총 <span className="font-semibold text-gray-700">{total}건</span></p>
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none"
                >
                  <option value={20}>20개씩</option>
                  <option value={50}>50개씩</option>
                  <option value={100}>100개씩</option>
                  <option value={200}>200개씩</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >이전</button>
                <span className="text-xs text-gray-500 min-w-[80px] text-center">
                  {page} / {Math.ceil(total / limit) || 1}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(Math.ceil(total / limit), p + 1))}
                  disabled={page >= Math.ceil(total / limit)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >다음</button>
              </div>
              <p className="text-xs text-gray-400">합계: <span className="font-semibold text-gray-600">{formatPrice(items.filter(i => i.currency !== "USD").reduce((s, i) => s + (i.amount ?? 0), 0))}</span></p>
            </div>
          </div>

          {/* 모바일 카드 */}
          <div className="lg:hidden space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-500">총 <span className="font-semibold">{total}건</span></p>
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none"
                >
                  <option value={20}>20개씩</option>
                  <option value={50}>50개씩</option>
                  <option value={100}>100개씩</option>
                  <option value={200}>200개씩</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">이전</button>
                <span className="text-xs text-gray-500 min-w-[60px] text-center">{page} / {Math.ceil(total / limit) || 1}</span>
                <button onClick={() => setPage(p => Math.min(Math.ceil(total / limit), p + 1))} disabled={page >= Math.ceil(total / limit)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">다음</button>
              </div>
              <p className="text-xs text-gray-400">합계: <span className="font-semibold">{formatPrice(items.filter(i => i.currency !== "USD").reduce((s, i) => s + (i.amount ?? 0), 0))}</span></p>
            </div>
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ${TYPE_COLORS[item.type]?.bg} ${TYPE_COLORS[item.type]?.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${TYPE_COLORS[item.type]?.dot}`} />{item.type}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${CATEGORY_COLORS[item.category] || ""}`}>{item.category}</span>
                  </div>
                  <div className="text-right">
                    {item.txNo && <p className="text-xs font-mono font-semibold text-gray-600">#{item.txNo}</p>}
                    <p className="text-xs text-gray-400">{item.date}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{item.code}</span>
                    {item.barcode && <span className="text-xs font-mono text-gray-400">· {item.barcode}</span>}
                  </div>
                </div>
                {item.currency !== "USD" ? (
                  <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                    <div className="flex items-center gap-4">
                      <div><p className="text-[10px] text-gray-400">수량</p><p className="text-sm font-bold text-gray-900">{formatQty(item.qty)}</p></div>
                      <div><p className="text-[10px] text-gray-400">금액</p><p className="text-sm text-gray-600">{formatPrice(item.amount)}</p></div>
                      <div><p className="text-[10px] text-gray-400">거래처</p><p className="text-sm text-gray-600 max-w-[120px] truncate">{item.partner || "-"}</p></div>
                      {item.userName && <div><p className="text-[10px] text-gray-400">등록자</p><p className="text-sm text-gray-500 max-w-[80px] truncate">{item.userName}</p></div>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditItem(item)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit size={16} /></button>
                      <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-gray-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div><p className="text-[10px] text-gray-400">수량</p><p className="text-sm font-bold text-gray-900">{formatQty(item.qty)}</p></div>
                        <div><p className="text-[10px] text-gray-400">거래처</p><p className="text-sm text-gray-600 max-w-[120px] truncate">{item.partner || "-"}</p></div>
                        {item.userName && <div><p className="text-[10px] text-gray-400">등록자</p><p className="text-sm text-gray-500 max-w-[80px] truncate">{item.userName}</p></div>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditItem(item)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit size={16} /></button>
                        <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600"><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-1">
                      <p className="text-sm font-semibold text-gray-700">{item.amount != null ? `$${item.amount.toLocaleString()}` : "-"}</p>
                      {item.exchangeRateAtEntry && item.amount != null && (
                        <p className="text-xs text-gray-400">등록시 ₩{Math.round(item.amount * item.exchangeRateAtEntry).toLocaleString()} ({item.exchangeRateAtEntry.toLocaleString()}원)</p>
                      )}
                      {exchangeRate && item.amount != null && (
                        <p className="text-xs text-gray-400">현재 ₩{Math.round(item.amount * exchangeRate).toLocaleString()} ({exchangeRate.toLocaleString()}원)</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <TransactionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { setModalOpen(false); fetchData(); }}
      />
      {editItem && (
        <EditTransactionModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSuccess={() => { setEditItem(null); fetchData(); }}
        />
      )}
    </div>
  );
}
