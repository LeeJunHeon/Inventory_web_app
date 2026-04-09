"use client";

import { useState, useEffect } from "react";
import { Search, Download, Calendar, Loader2 } from "lucide-react";
import { TYPE_COLORS, CATEGORY_COLORS, formatPrice, formatQty, InventoryItem } from "@/lib/data";

// ── CSV 다운로드 헬퍼 ──────────────────────────────
function downloadCSV(data: InventoryItem[], startDate: string, endDate: string) {
  const headers = ["날짜", "구분", "품목군", "품목코드", "품목명", "수량", "단가", "금액", "거래처", "담당자", "바코드", "메모"];
  const rows = data.map(i => [
    i.date, i.type, i.category, i.code, i.name,
    i.qty, i.price, i.amount, i.partner, i.handler, i.barcode, i.memo,
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `재고내역_${startDate}_${endDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// 이번 달 1일 ~ 오늘 기본값
function getDefaultDates() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${d}` };
}

export default function PeriodPage() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate]       = useState(defaults.start);
  const [endDate, setEndDate]           = useState(defaults.end);
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [typeFilter, setTypeFilter]         = useState("전체");
  const [manualRate, setManualRate]         = useState<string>("");
  const [currentRate, setCurrentRate]       = useState<number | null>(null);
  const [usingCurrentRate, setUsingCurrentRate] = useState(false);
  const [items, setItems]               = useState<InventoryItem[]>([]);
  const [loading, setLoading]           = useState(false);
  const [searched, setSearched]         = useState(false);

  useEffect(() => {
    fetch("/api/exchange-rate")
      .then(r => r.json())
      .then(data => setCurrentRate(data.rate))
      .catch(() => setCurrentRate(1400));
  }, []);

  const getRate = (item: InventoryItem): number => {
    if (manualRate && Number(manualRate) > 0) return Number(manualRate);
    if (item.exchangeRateAtEntry) return item.exchangeRateAtEntry;
    return currentRate ?? 1400;
  };

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ startDate, endDate, limit: "9999" });
      if (categoryFilter !== "전체") params.set("category", categoryFilter);
      if (typeFilter !== "전체") params.set("type", typeFilter);
      const res = await fetch(`/api/inventory?${params}`);
      if (res.ok) {
        const json = await res.json();
        const data: InventoryItem[] = json.data ?? json;
        setItems(data);
        const hasUsdWithNoRate = data.some(
          (item: InventoryItem) => item.currency === "USD" && !item.exchangeRateAtEntry
        );
        setUsingCurrentRate(!manualRate && hasUsdWithNoRate);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCSV = () => {
    if (items.length === 0) { alert("내보낼 데이터가 없습니다."); return; }
    downloadCSV(items, startDate, endDate);
  };

  const summary = { 입고: { count: 0, qty: 0, amount: 0 }, 출고: { count: 0, qty: 0, amount: 0 }, 불출: { count: 0, qty: 0, amount: 0 } };
  items.forEach((item) => {
    const s = summary[item.type as keyof typeof summary];
    if (s) {
      s.count++;
      s.qty += item.qty;
      const krwAmount = item.currency === "USD"
        ? (item.amount ?? 0) * getRate(item)
        : (item.amount ?? 0);
      s.amount += krwAmount;
    }
  });

  const CATEGORY_LIST = ["타겟", "웨이퍼", "가스", "기자재/소모품"];
  const TYPE_LIST = ["입고", "출고", "불출"] as const;

  const categoryBreakdown: Record<string, Record<string, { count: number; qty: number; amount: number }>> = {};
  CATEGORY_LIST.forEach(cat => {
    categoryBreakdown[cat] = {
      입고: { count: 0, qty: 0, amount: 0 },
      출고: { count: 0, qty: 0, amount: 0 },
      불출: { count: 0, qty: 0, amount: 0 },
    };
  });
  items.forEach(item => {
    const cat = categoryBreakdown[item.category];
    if (!cat) return;
    const s = cat[item.type];
    if (!s) return;
    s.count++;
    s.qty += item.qty;
    const krwAmount = item.currency === "USD"
      ? (item.amount ?? 0) * getRate(item)
      : (item.amount ?? 0);
    s.amount += krwAmount;
  });
  const activeCats = CATEGORY_LIST.filter(cat =>
    TYPE_LIST.some(t => categoryBreakdown[cat][t].count > 0)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">기간별 조회</h1>
        <p className="text-sm text-gray-500 mt-0.5">기간을 지정하여 입출고 내역을 조회합니다</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">시작일</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <span className="text-gray-300 pb-2.5">~</span>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">종료일</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">품목군</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              <option>전체</option><option>웨이퍼</option><option>타겟</option><option>가스</option><option>기자재/소모품</option>
            </select>
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            {["전체", "입고", "출고", "불출"].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  typeFilter === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >{t}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 shrink-0">환율</label>
            <div className="relative">
              <input
                type="number"
                placeholder="비우면 등록시 환율 사용"
                value={manualRate}
                onChange={e => setManualRate(e.target.value)}
                className="w-44 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원/USD</span>
            </div>
          </div>
          <button onClick={handleSearch}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600">
            <Search size={16} />조회
          </button>
          {/* ✅ CSV 버튼 — 실제 다운로드 */}
          <button
            onClick={handleCSV}
            disabled={!searched || items.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Download size={16} />CSV
          </button>
        </div>
      </div>

      {searched && usingCurrentRate && currentRate && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <span>⚠</span>
          <span>
            등록시 환율이 없는 USD 거래가 있어 현재 환율
            <span className="font-bold mx-1">₩{currentRate.toLocaleString()}</span>
            을 기준으로 계산되었습니다.
          </span>
        </div>
      )}

      {searched && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(["입고", "출고", "불출"] as const).map((type) => (
              <div key={type} className={`rounded-2xl border p-4 transition-all ${
                typeFilter === "전체" || typeFilter === type
                  ? `${TYPE_COLORS[type].bg} ${TYPE_COLORS[type].border}`
                  : "bg-gray-50 border-gray-100 opacity-40"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${TYPE_COLORS[type].dot}`} />
                  <span className={`text-sm font-semibold ${TYPE_COLORS[type].text}`}>{type}</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-gray-900">{summary[type].count}건</span>
                  <span className="text-sm text-gray-500">{formatQty(summary[type].qty)}개</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{formatPrice(summary[type].amount)}</p>
              </div>
            ))}
          </div>

          {activeCats.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">품목군별 상세 현황</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목군</th>
                      {TYPE_LIST.map(t => (
                        <th key={t} className={`text-center text-xs font-semibold px-5 py-3 ${TYPE_COLORS[t]?.text ?? "text-gray-500"}`}>
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeCats.map(cat => (
                      <tr key={cat} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat] || ""}`}>
                            {cat}
                          </span>
                        </td>
                        {TYPE_LIST.map(t => {
                          const s = categoryBreakdown[cat][t];
                          return (
                            <td key={t} className="px-5 py-3 text-center">
                              {s.count > 0 ? (
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{s.count}건 / {s.qty.toLocaleString()}개</p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {s.amount > 0 ? `₩${Math.round(s.amount).toLocaleString()}` : "-"}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-300">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">상세 내역</h2>
              <span className="text-xs text-gray-400">{items.length}건</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
            ) : items.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">조회된 데이터가 없습니다</div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">날짜</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">구분</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">품목군</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">품목</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5">수량</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5">금액</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">거래처</th>
                    </tr></thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                          <td className="px-5 py-3 text-sm text-gray-600">{item.date}</td>
                          <td className="px-5 py-3"><span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${TYPE_COLORS[item.type]?.bg} ${TYPE_COLORS[item.type]?.text}`}>{item.type}</span></td>
                          <td className="px-5 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || ""}`}>{item.category}</span></td>
                          <td className="px-5 py-3"><p className="text-sm font-medium text-gray-900">{item.name}</p><p className="text-xs text-gray-400">{item.code}</p></td>
                          <td className="px-5 py-3 text-sm text-right font-semibold">{formatQty(item.qty)}</td>
                          <td className="px-5 py-3 text-sm text-right text-gray-600">
                            {item.currency === "USD"
                              ? `₩${Math.round((item.amount ?? 0) * getRate(item)).toLocaleString()}`
                              : formatPrice(item.amount)}
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-600">{item.partner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-gray-50">
                  {items.map((item) => (
                    <div key={item.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${TYPE_COLORS[item.type]?.bg} ${TYPE_COLORS[item.type]?.text}`}>{item.type}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || ""}`}>{item.category}</span>
                        </div>
                        <span className="text-xs text-gray-400">{item.date}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span>수량 <span className="font-bold">{item.qty}</span></span>
                        <span className="text-gray-400">
                          {item.currency === "USD"
                            ? `₩${Math.round((item.amount ?? 0) * getRate(item)).toLocaleString()}`
                            : formatPrice(item.amount)}
                        </span>
                        <span className="text-gray-400 truncate">{item.partner}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
