"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import CsvButton from "@/components/CsvButton";
import { useSession } from "next-auth/react";
import DatePicker from "./DatePicker";
import { TYPE_COLORS, CATEGORY_COLORS, formatPrice, formatQty, InventoryItem } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { exportCSV } from "@/lib/csvUtils";

// 이번 달 1일 ~ 오늘 기본값
function getDefaultDates() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${d}` };
}

export default function PeriodPage() {
  const { data: session } = useSession();
  const isEmployee = (session?.user as any)?.role === "employee";

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

  const { t } = useT();

  const CAT_LABEL_MAP: Record<string, string> = {
    "전체": t.inventory.catAll,
    "웨이퍼": t.inventory.catWafer,
    "타겟": t.inventory.catTarget,
    "ALD Canister": t.inventory.catAldCanister,
    "가스": t.inventory.catGas,
    "기자재/소모품": t.inventory.catEquip,
  };
  const TYPE_LABEL_MAP: Record<string, string> = {
    "전체": t.inventory.typeAll,
    "입고": t.inventory.typeIn,
    "출고": t.inventory.typeOut,
    "불출": t.inventory.typeDis,
  };

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

  const handleSearch = useCallback(async () => {
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
  }, [startDate, endDate, categoryFilter, typeFilter, manualRate, currentRate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentRate === null) return;
    handleSearch();
  }, [startDate, endDate, categoryFilter, typeFilter, manualRate, currentRate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCSV = () => {
    if (items.length === 0) { alert(t.inventory.noExportData); return; }
    exportCSV(t.period.csvHeaders, items.map(i => [
      i.date, i.type, i.category, i.code, i.name,
      i.qty, i.price, i.amount, i.partner, i.handler, i.barcode, i.memo,
    ]), `${t.period.csvFilename}_${startDate}_${endDate}.csv`);
  };

  const summary = {
    입고: { count: 0, qty: 0, krwAmount: 0, usdAmount: 0 },
    출고: { count: 0, qty: 0, krwAmount: 0, usdAmount: 0 },
    불출: { count: 0, qty: 0, krwAmount: 0, usdAmount: 0 },
  };
  items.forEach((item) => {
    const s = summary[item.type as keyof typeof summary];
    if (s) {
      s.count++;
      s.qty += item.qty;
      if (item.currency === "USD") {
        s.usdAmount += (item.amount ?? 0);
      } else {
        s.krwAmount += (item.amount ?? 0);
      }
    }
  });

  const CATEGORY_LIST = ["타겟", "ALD Canister", "웨이퍼", "가스", "기자재/소모품"];
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
    TYPE_LIST.some(type => categoryBreakdown[cat][type].count > 0)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.nav.period}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t.period.subtitle}</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
        <div className="space-y-3">
          {/* 첫 번째 줄: 날짜 + 품목군 + 구분 필터 */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.inventory.startDate}</label>
              <DatePicker
                value={startDate}
                onChange={val => setStartDate(val)}
                placeholder={t.inventory.startDate}
              />
            </div>
            <span className="text-gray-300 pb-2.5">~</span>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.inventory.endDate}</label>
              <DatePicker
                value={endDate}
                onChange={val => setEndDate(val)}
                placeholder={t.inventory.endDate}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.period.catLabel}</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                {["전체", "웨이퍼", "타겟", "ALD Canister", "가스", "기자재/소모품"].map(cat => (
                  <option key={cat} value={cat}>{CAT_LABEL_MAP[cat] || cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.period.typeLabel}</label>
              <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 overflow-x-auto">
                {["전체", "입고", "출고", "불출"].map(type => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      typeFilter === type ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                    }`}
                  >
                    {TYPE_LABEL_MAP[type] || type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 두 번째 줄: 환율 + CSV */}
          <div className="flex flex-wrap gap-3 items-end justify-between">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.period.exchangeRateLabel}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder={t.period.exchangeRatePlaceholder}
                  value={manualRate}
                  onChange={e => setManualRate(e.target.value)}
                  className="pl-3 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none w-52"
                />
                <span className="text-xs text-gray-400 whitespace-nowrap">{t.period.wonPerUsd}</span>
              </div>
            </div>
            <CsvButton onClick={handleCSV} disabled={items.length === 0} />
          </div>
        </div>
      </div>

      {searched && usingCurrentRate && currentRate && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <span>⚠</span>
          <span>{t.period.rateWarning(currentRate)}</span>
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
                  <span className={`text-sm font-semibold ${TYPE_COLORS[type].text}`}>
                    {TYPE_LABEL_MAP[type] || type}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-gray-900">{summary[type].count}{t.period.countUnit}</span>
                  <span className="text-sm text-gray-500">{formatQty(summary[type].qty)}{t.period.qtyUnit}</span>
                </div>
                <div className="mt-2 space-y-0.5">
                  <p className="text-xs text-gray-500">
                    ₩ {summary[type].krwAmount > 0 ? summary[type].krwAmount.toLocaleString() : "0"}
                  </p>
                  {summary[type].usdAmount > 0 && (
                    <p className="text-xs text-gray-500">
                      $ {summary[type].usdAmount.toLocaleString()}
                    </p>
                  )}
                  {summary[type].usdAmount > 0 && (
                    <p className="text-xs font-semibold text-gray-700 border-t border-gray-200 pt-0.5 mt-0.5">
                      ≈ ₩ {Math.round(summary[type].krwAmount + summary[type].usdAmount * (Number(manualRate) > 0 ? Number(manualRate) : (currentRate ?? 1400))).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {activeCats.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">{t.period.catBreakdownTitle}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.period.catCol}</th>
                      {TYPE_LIST.map(type => (
                        <th key={type} className={`text-center text-xs font-semibold px-5 py-3 ${TYPE_COLORS[type]?.text ?? "text-gray-500"}`}>
                          {TYPE_LABEL_MAP[type] || type}
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
                        {TYPE_LIST.map(type => {
                          const s = categoryBreakdown[cat][type];
                          return (
                            <td key={type} className="px-5 py-3 text-center">
                              {s.count > 0 ? (
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{s.count}{t.period.countUnit} / {s.qty.toLocaleString()}{t.period.qtyUnit}</p>
                                  {!isEmployee && (
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {s.amount > 0 ? `₩${Math.round(s.amount).toLocaleString()}` : "-"}
                                  </p>
                                  )}
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
              <h2 className="font-bold text-gray-900">{t.period.detailTitle}</h2>
              <span className="text-xs text-gray-400">{items.length}{t.period.countUnit}</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
            ) : items.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">{t.period.noData}</div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">{t.inventory.colDate}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">{t.inventory.colType}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">{t.inventory.colCategory}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">{t.inventory.colItem}</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5">{t.inventory.colQty}</th>
                      {!isEmployee && <th className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5">{t.inventory.colAmount}</th>}
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">{t.inventory.colPartner}</th>
                    </tr></thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                          <td className="px-5 py-3 text-sm text-gray-600">{item.date}</td>
                          <td className="px-5 py-3"><span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${TYPE_COLORS[item.type]?.bg} ${TYPE_COLORS[item.type]?.text}`}>{item.type}</span></td>
                          <td className="px-5 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || ""}`}>{item.category}</span></td>
                          <td className="px-5 py-3"><p className="text-sm font-medium text-gray-900">{item.name}</p><p className="text-xs text-gray-400">{item.code}</p></td>
                          <td className="px-5 py-3 text-sm text-right font-semibold">{formatQty(item.qty)}</td>
                          {!isEmployee && <td className="px-5 py-3 text-sm text-right text-gray-600">
                            {item.currency === "USD" ? (
                              <div>
                                <p className="text-sm font-semibold text-gray-700">
                                  ${(item.amount ?? 0).toLocaleString()} × {getRate(item).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  ≈ ₩{Math.round((item.amount ?? 0) * getRate(item)).toLocaleString()}
                                </p>
                              </div>
                            ) : formatPrice(item.amount)}
                          </td>}
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
                        <span>{t.inventory.colQty} <span className="font-bold">{item.qty}</span></span>
                        {!isEmployee && <span className="text-gray-400">
                          {item.currency === "USD" ? (
                            <span>
                              ${(item.amount ?? 0).toLocaleString()} × {getRate(item).toLocaleString()} ≈ ₩{Math.round((item.amount ?? 0) * getRate(item)).toLocaleString()}
                            </span>
                          ) : formatPrice(item.amount)}
                        </span>}
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
