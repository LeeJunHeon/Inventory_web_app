"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, AlertTriangle, CheckCircle, AlertCircle, Loader2, Check, X } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/data";

interface LocationOption { id: number; name: string; }

interface StockItem {
  id: number; code: string; name: string;
  currentQty: number; requiredQty: number;
  category: string; attrs?: Record<string, string>;
}

function getSupplyLevel(current: number, required: number) {
  if (required === 0) return { label: "기준없음", color: "text-gray-400 bg-gray-50", icon: CheckCircle };
  const ratio = current / required;
  if (ratio >= 1.2) return { label: "안정",  color: "text-emerald-700 bg-emerald-50", icon: CheckCircle };
  if (ratio >= 1.0) return { label: "주의",  color: "text-amber-700 bg-amber-50",    icon: AlertCircle };
  return               { label: "부족",  color: "text-rose-700 bg-rose-50",      icon: AlertTriangle };
}

const CATS = ["웨이퍼", "타겟", "가스", "기자재/소모품"];

interface StatusPageProps {
  initialLocationId?: number | null;
}

export default function StatusPage({ initialLocationId }: StatusPageProps) {
  const [items, setItems]                   = useState<StockItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [locationOptions, setLocationOptions]   = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(initialLocationId ?? null);
  // 인라인 필요수량 편집 상태
  const [editingId, setEditingId]           = useState<number | null>(null);
  const [editValue, setEditValue]           = useState("");
  const [savingId, setSavingId]             = useState<number | null>(null);
  const [toast, setToast]                   = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedLocationId !== null) params.set("locationId", String(selectedLocationId));
      const res = await fetch(`/api/status?${params}`);
      if (res.ok) setItems(await res.json());
    } catch { setToast("데이터 조회에 실패했습니다."); setTimeout(() => setToast(""), 3000); }
    finally { setLoading(false); }
  }, [selectedLocationId]);

  // 위치 목록 로드 (최초 1회) — 본사(1), 공덕(2)만 표시
  useEffect(() => {
    fetch("/api/locations")
      .then(r => r.json())
      .then((locs: LocationOption[]) => {
        const filtered = locs.filter(l => l.id === 1 || l.id === 2);
        setLocationOptions(filtered.length > 0 ? filtered : locs);
      })
      .catch(() => {
        setToast("위치 목록을 불러오지 못했습니다. 페이지를 새로고침 해주세요.");
        setTimeout(() => setToast(""), 4000);
      });
  }, []);

  // 위치 바뀔 때마다 재고 재조회
  useEffect(() => { fetchData(); }, [fetchData]);

  // 필요수량 저장
  const handleSaveRequired = async (item: StockItem) => {
    const qty = Number(editValue);
    if (isNaN(qty) || qty < 0) {
      setToast("0 이상의 숫자를 입력해주세요.");
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
    } catch { setToast("필요수량 저장에 실패했습니다."); setTimeout(() => setToast(""), 3000); }
    finally { setSavingId(null); setEditingId(null); }
  };

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch = !search || item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
    const matchCat    = selectedCategory === "전체" || item.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const shortageCount = items.filter((i) => i.requiredQty > 0 && i.currentQty < i.requiredQty).length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-blue-500" />
      <span className="ml-2 text-sm text-gray-500">로딩 중...</span>
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
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">보유 현황</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedLocationId === null
              ? "전체 위치 · 품목별 현재 재고와 수급 상태를 확인합니다"
              : `${locationOptions.find(l => l.id === selectedLocationId)?.name ?? ""} 위치 기준`}
          </p>
        </div>
        {shortageCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl">
            <AlertTriangle size={16} className="text-rose-500" />
            <span className="text-sm font-semibold text-rose-700">부족 품목 {shortageCount}건</span>
          </div>
        )}
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
              전체
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

      {/* 검색 + 품목군 필터 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="품목코드, 품목명 검색..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            {["전체", ...CATS].map((c) => (
              <button key={c} onClick={() => setSelectedCategory(c)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${selectedCategory === c ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {CATS.filter((cat) => selectedCategory === "전체" || selectedCategory === cat).map((cat) => {
        const catItems = filtered.filter((i) => i.category === cat);
        if (catItems.length === 0 && search) return null;
        return (
          <div key={cat} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[cat] || ""}`}>{cat}</span>
                <span className="text-xs text-gray-400">{catItems.length}종</span>
              </div>
              <p className="text-xs text-gray-400">필요수량 셀을 클릭해 직접 수정하세요</p>
            </div>

            {catItems.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">{search ? "검색 결과가 없습니다" : "등록된 품목이 없습니다"}</div>
            ) : (
              <>
                {/* 데스크탑 테이블 */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="bg-gray-50/50">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">품목코드</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">품목명</th>
                      {cat === "웨이퍼" && <><th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">저항</th><th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">두께</th></>}
                      {cat === "타겟"   && <><th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">순도</th><th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">Copper</th></>}
                      <th className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5">보유수량</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5">필요수량 ✏️</th>
                      <th className="text-center text-xs font-semibold text-gray-500 px-5 py-2.5">수급상태</th>
                    </tr></thead>
                    <tbody>
                      {catItems.map((item) => {
                        const level   = getSupplyLevel(item.currentQty, item.requiredQty);
                        const editing = editingId === item.id;
                        return (
                          <tr key={item.code} className="border-t border-gray-50 hover:bg-blue-50/30">
                            <td className="px-5 py-3 text-sm font-mono text-gray-600">{item.code}</td>
                            <td className="px-5 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                            {cat === "웨이퍼" && <><td className="px-5 py-3 text-sm text-gray-500">{item.attrs?.["저항"] || "-"}</td><td className="px-5 py-3 text-sm text-gray-500">{item.attrs?.["두께"] || "-"}</td></>}
                            {cat === "타겟"   && <><td className="px-5 py-3 text-sm text-gray-500">{item.attrs?.["순도"] || "-"}</td><td className="px-5 py-3 text-sm text-gray-500">{item.attrs?.["Copper"] || "-"}</td></>}
                            <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">{item.currentQty}</td>

                            {/* ✅ 필요수량 인라인 편집 */}
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
                    const level   = getSupplyLevel(item.currentQty, item.requiredQty);
                    const editing = editingId === item.id;
                    return (
                      <div key={item.code} className="px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <div><p className="text-sm font-semibold text-gray-900">{item.name}</p><p className="text-xs text-gray-400">{item.code}</p></div>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${level.color}`}><level.icon size={12} />{level.label}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-500">보유 <span className="font-bold text-gray-900">{item.currentQty}</span></span>
                          <span className="text-gray-400">/ 필요{" "}
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
