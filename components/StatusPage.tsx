"use client";

import { useState, useEffect } from "react";
import { Search, AlertTriangle, CheckCircle, AlertCircle, Loader2, Check, X } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/data";

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

export default function StatusPage() {
  const [items, setItems]                   = useState<StockItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  // 인라인 필요수량 편집 상태
  const [editingId, setEditingId]           = useState<number | null>(null);
  const [editValue, setEditValue]           = useState("");
  const [savingId, setSavingId]             = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/status");
      if (res.ok) setItems(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // 필요수량 저장
  const handleSaveRequired = async (item: StockItem) => {
    const qty = Number(editValue);
    if (isNaN(qty) || qty < 0) { setEditingId(null); return; }
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
    } catch { console.error("필요수량 저장 실패"); }
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">보유 현황</h1>
          <p className="text-sm text-gray-500 mt-0.5">품목별 현재 재고와 수급 상태를 확인합니다</p>
        </div>
        {shortageCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl">
            <AlertTriangle size={16} className="text-rose-500" />
            <span className="text-sm font-semibold text-rose-700">부족 품목 {shortageCount}건</span>
          </div>
        )}
      </div>

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
