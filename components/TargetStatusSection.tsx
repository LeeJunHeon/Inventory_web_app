"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { TARGET_STATUS_LABELS } from "@/lib/data";

interface TargetItem {
  id: number;
  status: string;
  barcodeCode: string;
  itemCode: string;
  itemName: string;
  latestWeight: number | null;
  latestLoggedAt: string | null;
  locationName: string | null;
  inboundDate: string | null;
}

const STATUS_TABS = ["전체", "미사용", "사용중", "폐기", "판매완료"] as const;

export default function TargetStatusSection() {
  const [items, setItems] = useState<TargetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("전체");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/targets/status");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setItems(data);
    } catch {
      setError("데이터를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const counts = items.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  const filtered = items.filter((t) => {
    if (statusFilter !== "전체" && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.barcodeCode.toLowerCase().includes(q) && !t.itemName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const SUMMARY_CARDS: { key: string; label: string; color: string; textColor: string }[] = [
    { key: "미사용",   label: "미사용",   color: "bg-emerald-50 border-emerald-200", textColor: "text-emerald-700" },
    { key: "사용중",   label: "사용중",   color: "bg-blue-50 border-blue-200",       textColor: "text-blue-700" },
    { key: "폐기",     label: "폐기",     color: "bg-gray-50 border-gray-200",       textColor: "text-gray-500" },
    { key: "판매완료", label: "판매완료", color: "bg-purple-50 border-purple-200",   textColor: "text-purple-700" },
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-12 flex items-center justify-center gap-2 text-gray-400">
        <Loader2 size={18} className="animate-spin" /><span className="text-sm">로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-12 text-center text-sm text-rose-500">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-100 text-sky-700">타겟</span>
          <span className="text-xs text-gray-400">{items.length}개</span>
        </div>
      </div>

      {/* 요약 카드 + 전체 버튼 */}
      <div className="px-5 pt-4 pb-2 flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("전체")}
          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
            statusFilter === "전체"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
          }`}
        >
          전체 {items.length}
        </button>
        {SUMMARY_CARDS.map((c) => (
          <button
            key={c.key}
            onClick={() => setStatusFilter(statusFilter === c.key ? "전체" : c.key)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              statusFilter === c.key
                ? `${c.color} ${c.textColor} ring-2 ring-offset-1 ring-current`
                : `bg-white text-gray-500 border-gray-200 hover:border-gray-300`
            }`}
          >
            {c.label} {counts[c.key] || 0}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="px-5 pb-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="바코드 또는 품목명 검색"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* 테이블 */}
      {filtered.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          {search ? "검색 결과가 없습니다" : "해당 상태의 타겟이 없습니다"}
        </div>
      ) : (
        <>
          {/* 데스크탑 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">바코드</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">품목명</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">상태</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">현재 무게</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">마지막 측정일</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">현재 위치</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">입고일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const badge = TARGET_STATUS_LABELS[t.status] || { label: t.status, color: "bg-gray-100 text-gray-500" };
                  return (
                    <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono text-gray-600">{t.barcodeCode || "-"}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{t.itemName}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {t.latestWeight != null ? `${t.latestWeight.toFixed(3)}g` : "미측정"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {t.latestLoggedAt ? t.latestLoggedAt.replace("T", " ").slice(0, 16) : "-"}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{t.locationName || "-"}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{t.inboundDate || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일 */}
          <div className="md:hidden divide-y divide-gray-50">
            {filtered.map((t) => {
              const badge = TARGET_STATUS_LABELS[t.status] || { label: t.status, color: "bg-gray-100 text-gray-500" };
              return (
                <div key={t.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-900">{t.itemName}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span className="font-mono">{t.barcodeCode || "-"}</span>
                    <span>{t.latestWeight != null ? `${t.latestWeight.toFixed(3)}g` : "미측정"}</span>
                    <span>{t.locationName || "-"}</span>
                    <span>{t.inboundDate || "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
