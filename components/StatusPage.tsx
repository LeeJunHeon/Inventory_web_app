"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, AlertTriangle, CheckCircle, AlertCircle, Loader2, Check, X, ChevronUp, ChevronDown, ChevronsUpDown, Download } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/data";
import TargetStatusSection from "@/components/TargetStatusSection";
import { useT } from "@/lib/i18n";
import type { Messages } from "@/messages/ko";
import { exportCSV } from "@/lib/csvUtils";

interface LocationOption { id: number; name: string; }

interface StockItem {
  id: number; code: string; name: string;
  currentQty: number; requiredQty: number;
  category: string; attrs?: Record<string, string>;
  barcodes?: string[];
  locationQty?: Record<number, number>;
}

function getSupplyLevel(current: number, required: number, t: Messages) {
  if (required === 0) return { label: t.status.levelNone,     color: "text-gray-400 bg-gray-50",       icon: CheckCircle };
  const ratio = current / required;
  if (ratio >= 1.2) return { label: t.status.levelStable,   color: "text-emerald-700 bg-emerald-50", icon: CheckCircle };
  if (ratio >= 1.0) return { label: t.status.levelCaution,  color: "text-amber-700 bg-amber-50",     icon: AlertCircle };
  return               { label: t.status.levelShortage, color: "text-rose-700 bg-rose-50",      icon: AlertTriangle };
}

const CATS = ["웨이퍼", "타겟", "가스", "기자재/소모품"];

interface StatusPageProps {
  initialLocationId?: number | null;
  initialStockFilter?: "전체" | "보유중" | "미보유" | "부족";
}

export default function StatusPage({ initialLocationId, initialStockFilter }: StatusPageProps) {
  const [items, setItems]                   = useState<StockItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [locationOptions, setLocationOptions]   = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(initialLocationId ?? null);
  const [editingId, setEditingId]           = useState<number | null>(null);
  const [editValue, setEditValue]           = useState("");
  const [savingId, setSavingId]             = useState<number | null>(null);
  const [toast, setToast]                   = useState("");
  const [stockFilter, setStockFilter]       = useState<"전체" | "보유중" | "미보유" | "부족">(initialStockFilter ?? "전체");
  const [sortField, setSortField]           = useState<"name" | "code" | "category" | "currentQty" | "requiredQty">("name");
  const [sortDir, setSortDir]               = useState<"asc" | "desc">("asc");

  const { t } = useT();

  const STOCK_FILTER_LABEL: Record<string, string> = {
    "전체": t.status.sfAll,
    "보유중": t.status.sfInStock,
    "미보유": t.status.sfOutStock,
    "부족": t.status.sfShortage,
  };
  const CAT_LABEL_MAP: Record<string, string> = {
    "전체": t.status.catAll,
    "웨이퍼": t.status.catWafer,
    "타겟": t.status.catTarget,
    "가스": t.status.catGas,
    "기자재/소모품": t.status.catEquip,
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedLocationId !== null) params.set("locationId", String(selectedLocationId));
      const res = await fetch(`/api/status?${params}`);
      if (res.ok) setItems(await res.json());
    } catch { setToast(t.common.loadFail); setTimeout(() => setToast(""), 3000); }
    finally { setLoading(false); }
  }, [selectedLocationId, t]);

  useEffect(() => {
    fetch("/api/locations")
      .then(r => r.json())
      .then((locs: LocationOption[]) => {
        const filtered = locs.filter(l => l.id === 1 || l.id === 2);
        setLocationOptions(filtered.length > 0 ? filtered : locs);
      })
      .catch(() => {
        setToast(t.status.locLoadFail);
        setTimeout(() => setToast(""), 4000);
      });
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveRequired = async (item: StockItem) => {
    const qty = Number(editValue);
    if (isNaN(qty) || qty < 0) {
      setToast(t.status.invalidQty);
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setSavingId(item.id);
    try {
      const res = await fetch("/api/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, quantity: qty }),
      });
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, requiredQty: qty } : i));
      }
    } catch { setToast(t.status.saveRequiredFail); setTimeout(() => setToast(""), 3000); }
    finally { setSavingId(null); setEditingId(null); }
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronsUpDown size={12} className="opacity-30 inline ml-0.5" />;
    return sortDir === "asc"
      ? <ChevronUp size={12} className="text-blue-600 inline ml-0.5" />
      : <ChevronDown size={12} className="text-blue-600 inline ml-0.5" />;
  };

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch = !search || item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q) || (item.barcodes?.some(b => b.toLowerCase().includes(q)) ?? false);
    const matchCat    = selectedCategory === "전체" || item.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const handleExportCSV = () => {
    if (!filtered || filtered.length === 0) return;
    exportCSV(
      ["품목코드", "품목명", "품목군", "바코드", "본사", "공덕", "합계", "최소수량", "수급상태"],
      filtered.map(item => [
        item.code, item.name, item.category,
        (item.barcodes ?? []).join(" / "),
        item.locationQty?.[1] ?? 0,
        item.locationQty?.[2] ?? 0,
        item.currentQty,
        item.requiredQty,
        getSupplyLevel(item.currentQty, item.requiredQty, t).label,
      ]),
      `보유현황_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const filteredItems = filtered.filter(item => {
    if (stockFilter === "보유중") return item.currentQty > 0;
    if (stockFilter === "미보유") return item.currentQty === 0;
    if (stockFilter === "부족") return item.requiredQty > 0 && item.currentQty < item.requiredQty;
    return true;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    const v = sortDir === "asc" ? 1 : -1;
    if (sortField === "currentQty" || sortField === "requiredQty")
      return (a[sortField] - b[sortField]) * v;
    return String(a[sortField]).localeCompare(String(b[sortField]), "ko") * v;
  });

  const shortageCount = items.filter((i) => i.requiredQty > 0 && i.currentQty < i.requiredQty).length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-blue-500" />
      <span className="ml-2 text-sm text-gray-500">{t.common.loading}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.nav.status}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedLocationId === null
              ? t.status.subtitle
              : `${locationOptions.find(l => l.id === selectedLocationId)?.name ?? ""} ${t.status.locationBasis}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {shortageCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl">
              <AlertTriangle size={16} className="text-rose-500" />
              <span className="text-sm font-semibold text-rose-700">{t.status.shortageAlert(shortageCount)}</span>
            </div>
          )}
          <button onClick={handleExportCSV} disabled={!filtered || filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Download size={15} />CSV
          </button>
        </div>
      </div>

      {/* 위치 탭 */}
      {locationOptions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-3">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setSelectedLocationId(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                selectedLocationId === null
                  ? "bg-blue-500 text-white shadow-sm"
                  : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}>
              {t.status.locationAll}
            </button>
            {locationOptions.map(loc => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocationId(loc.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  selectedLocationId === loc.id
                    ? "bg-blue-500 text-white shadow-sm"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}>
                {loc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 보유상태 필터 */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {(["전체", "보유중", "미보유", "부족"] as const).map(f => (
          <button
            key={f}
            onClick={() => setStockFilter(f)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              stockFilter === f
                ? f === "부족" ? "bg-rose-500 text-white border-rose-500" : "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
            }`}
          >
            {STOCK_FILTER_LABEL[f]}
            {f === "보유중" && <span className="ml-1 text-xs opacity-75">({items.filter(i=>i.currentQty>0).length})</span>}
            {f === "미보유" && <span className="ml-1 text-xs opacity-75">({items.filter(i=>i.currentQty===0).length})</span>}
            {f === "부족" && <span className="ml-1 text-xs opacity-75">({items.filter(i=>i.requiredQty>0&&i.currentQty<i.requiredQty).length})</span>}
          </button>
        ))}
      </div>

      {/* 검색 + 품목군 필터 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder={t.status.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 overflow-x-auto">
            {["전체", ...CATS].map((cat) => (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${selectedCategory === cat ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {CAT_LABEL_MAP[cat] || cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {CATS.filter((cat) => selectedCategory === "전체" || selectedCategory === cat).map((cat) => {
        if (cat === "타겟") return <TargetStatusSection key={cat} />;
        const catItems = sortedItems.filter((i) => i.category === cat);
        if (catItems.length === 0 && search) return null;
        return (
          <div key={cat} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[cat] || ""}`}>{cat}</span>
                <span className="text-xs text-gray-400">{catItems.length}{t.status.countSuffix}</span>
              </div>
              <p className="text-xs text-gray-400">{t.status.editHint}</p>
            </div>

            {catItems.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                {search ? t.status.noSearchResult : t.status.noItems}
              </div>
            ) : (
              <>
                {/* 데스크탑 테이블 */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="bg-gray-50/50">
                      <th onClick={() => handleSort("code")} className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5 cursor-pointer select-none hover:text-blue-600">{t.status.colCode}<SortIcon field="code" /></th>
                      <th onClick={() => handleSort("name")} className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5 cursor-pointer select-none hover:text-blue-600">{t.status.colName}<SortIcon field="name" /></th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.status.colBarcode}</th>
                      {cat === "웨이퍼" && <><th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">{t.status.colResistivity}</th><th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">{t.status.colThickness}</th></>}
                      {cat === "타겟"   && <><th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">{t.status.colPurity}</th><th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">Copper</th></>}
                      {selectedLocationId === null ? (
                        <>
                          <th className="text-right text-xs font-semibold text-gray-500 px-3 py-2.5 whitespace-nowrap">{t.status.locationMain}</th>
                          <th className="text-right text-xs font-semibold text-gray-500 px-3 py-2.5 whitespace-nowrap">{t.status.locationGongdeok}</th>
                          <th onClick={() => handleSort("currentQty")} className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5 cursor-pointer select-none hover:text-blue-600 whitespace-nowrap">{t.status.colTotal}<SortIcon field="currentQty" /></th>
                        </>
                      ) : (
                        <th onClick={() => handleSort("currentQty")} className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5 cursor-pointer select-none hover:text-blue-600">{t.status.colStock}<SortIcon field="currentQty" /></th>
                      )}
                      <th onClick={() => handleSort("requiredQty")} className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5 cursor-pointer select-none hover:text-blue-600">{t.status.colRequired} ✏️<SortIcon field="requiredQty" /></th>
                      <th className="text-center text-xs font-semibold text-gray-500 px-5 py-2.5">{t.status.colSupplyStatus}</th>
                    </tr></thead>
                    <tbody>
                      {catItems.map((item) => {
                        const level   = getSupplyLevel(item.currentQty, item.requiredQty, t);
                        const editing = editingId === item.id;
                        return (
                          <tr key={item.code} className="border-t border-gray-50 hover:bg-blue-50/30">
                            <td className="px-5 py-3 text-sm font-mono text-gray-600">{item.code}</td>
                            <td className="px-5 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                            <td className="px-5 py-3 text-xs font-mono text-gray-400">{item.barcodes?.join(", ") || "-"}</td>
                            {cat === "웨이퍼" && <><td className="px-5 py-3 text-sm text-gray-500">{item.attrs?.["저항"] || "-"}</td><td className="px-5 py-3 text-sm text-gray-500">{item.attrs?.["두께"] || "-"}</td></>}
                            {cat === "타겟"   && <><td className="px-5 py-3 text-sm text-gray-500">{item.attrs?.["순도"] || "-"}</td><td className="px-5 py-3 text-sm text-gray-500">{item.attrs?.["Copper"] || "-"}</td></>}
                            {selectedLocationId === null ? (
                              <>
                                <td className="px-3 py-3 text-sm text-right text-gray-600">{item.locationQty?.[1] ?? 0}</td>
                                <td className="px-3 py-3 text-sm text-right text-gray-600">{item.locationQty?.[2] ?? 0}</td>
                                <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">{item.currentQty}</td>
                              </>
                            ) : (
                              <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">{item.currentQty}</td>
                            )}

                            {/* 필요수량 인라인 편집 */}
                            <td className="px-5 py-3 text-sm text-right">
                              {editing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <input type="number" min="0" value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") handleSaveRequired(item); if (e.key === "Escape") setEditingId(null); }}
                                    autoFocus
                                    className="w-20 px-2 py-1 border border-blue-400 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                  <button onClick={() => handleSaveRequired(item)} disabled={savingId === item.id}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                                    <Check size={14} />
                                  </button>
                                  <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg">
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => { setEditingId(item.id); setEditValue(String(item.requiredQty)); }}
                                  className="text-gray-500 hover:text-blue-600 hover:underline cursor-pointer transition-colors">
                                  {item.requiredQty || "-"}
                                </button>
                              )}
                            </td>

                            <td className="px-5 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${level.color}`}>
                                <level.icon size={12} />{level.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 모바일 카드 */}
                <div className="md:hidden divide-y divide-gray-50">
                  {catItems.map((item) => {
                    const level   = getSupplyLevel(item.currentQty, item.requiredQty, t);
                    const editing = editingId === item.id;
                    return (
                      <div key={item.code} className="px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-400">{item.code}</p>
                            {item.barcodes && item.barcodes.length > 0 && (
                              <p className="text-xs text-gray-400 font-mono mt-0.5">{item.barcodes.join(", ")}</p>
                            )}
                          </div>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${level.color}`}><level.icon size={12} />{level.label}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {selectedLocationId === null && item.locationQty ? (
                            <span className="text-gray-500">
                              {t.status.locationMain} <span className="font-bold text-gray-900">{item.locationQty[1] ?? 0}</span>
                              <span className="mx-1 text-gray-300">|</span>
                              {t.status.locationGongdeok} <span className="font-bold text-gray-900">{item.locationQty[2] ?? 0}</span>
                              <span className="mx-1 text-gray-300">|</span>
                              {t.status.colTotal} <span className="font-bold text-gray-900">{item.currentQty}</span>
                            </span>
                          ) : (
                            <span className="text-gray-500">{t.status.stockLabel} <span className="font-bold text-gray-900">{item.currentQty}</span></span>
                          )}
                          <span className="text-gray-400">/ {t.status.requiredLabel}{" "}
                            {editing ? (
                              <span className="inline-flex items-center gap-1">
                                <input type="number" min="0" value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") handleSaveRequired(item); if (e.key === "Escape") setEditingId(null); }}
                                  autoFocus className="w-16 px-1 py-0.5 border border-blue-400 rounded text-sm text-right" />
                                <button onClick={() => handleSaveRequired(item)} className="text-emerald-600"><Check size={13} /></button>
                                <button onClick={() => setEditingId(null)} className="text-gray-400"><X size={13} /></button>
                              </span>
                            ) : (
                              <button onClick={() => { setEditingId(item.id); setEditValue(String(item.requiredQty)); }}
                                className="font-medium hover:text-blue-600 hover:underline">
                                {item.requiredQty || "-"}
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
