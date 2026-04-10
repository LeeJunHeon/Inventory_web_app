"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Boxes, Loader2, MapPin } from "lucide-react";
import { TYPE_COLORS, CATEGORY_COLORS, formatPrice } from "@/lib/data";
import { useApi } from "@/lib/useApi";
import type { PageId } from "@/components/Sidebar";

interface LocationSummary {
  locationId: number; locationName: string;
  totalItems: number; shortageCount: number;
}

interface DashboardData {
  todayIn: { count: number; amount: number };
  todayOut: { count: number; amount: number };
  shortageCount: number;
  totalItems: number;
  locationSummary: LocationSummary[];
  recent: {
    id: number; date: string; type: string; category: string;
    name: string; qty: number; amount: number; partner: string;
  }[];
}

const DEFAULT: DashboardData = {
  todayIn: { count: 0, amount: 0 },
  todayOut: { count: 0, amount: 0 },
  shortageCount: 0,
  totalItems: 0,
  locationSummary: [],
  recent: [],
};

interface DashboardPageProps {
  onNavigate?: (page: PageId, locationId?: number | null, initialFilter?: { type?: string; date?: string }) => void;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { data, loading, error } = useApi<DashboardData>("/api/dashboard", DEFAULT);
  const [selectedRecent, setSelectedRecent] = useState<typeof data.recent[0] | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const stats = [
    {
      label: "오늘 입고",
      value: `${data.todayIn.count}건`,
      sub: formatPrice(data.todayIn.amount),
      icon: TrendingUp,
      color: "text-blue-600",
      bg: "bg-blue-50",
      onClick: () => onNavigate?.("inventory", null, { type: "입고", date: today }),
    },
    {
      label: "오늘 출고",
      value: `${data.todayOut.count}건`,
      sub: formatPrice(data.todayOut.amount),
      icon: TrendingDown,
      color: "text-rose-600",
      bg: "bg-rose-50",
      onClick: () => onNavigate?.("inventory", null, { type: "출고", date: today }),
    },
    {
      label: "재고 부족 품목",
      value: `${data.shortageCount}건`,
      sub: "확인 필요",
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
      onClick: () => onNavigate?.("status", null),
    },
    {
      label: "총 보유 품목",
      value: `${data.totalItems}종`,
      sub: "활성 품목 기준",
      icon: Boxes,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      onClick: () => onNavigate?.("status", null),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-blue-500" />
        <span className="ml-2 text-sm text-gray-500">로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle size={32} className="text-amber-500" />
        <p className="text-sm text-gray-500">대시보드 데이터를 불러오지 못했습니다.</p>
        <p className="text-xs text-gray-400">서버 연결을 확인하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 최근 내역 상세 팝업 */}
      {selectedRecent && (() => {
        const tc = TYPE_COLORS[selectedRecent.type as keyof typeof TYPE_COLORS];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            onClick={() => setSelectedRecent(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${tc?.bg} ${tc?.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${tc?.dot}`} />
                  {selectedRecent.type}
                </span>
                <button
                  onClick={() => setSelectedRecent(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  ✕
                </button>
              </div>
              <div className="divide-y divide-gray-100 text-sm">
                {[
                  { label: "날짜",  value: selectedRecent.date },
                  { label: "품목명", value: selectedRecent.name },
                  { label: "품목군", value: selectedRecent.category },
                  { label: "수량",  value: `${selectedRecent.type === "입고" ? "+" : "-"}${selectedRecent.qty}개` },
                  { label: "금액",  value: formatPrice(selectedRecent.amount) },
                  { label: "거래처", value: selectedRecent.partner || "-" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center py-2.5 gap-3">
                    <span className="w-16 text-xs text-gray-400 shrink-0">{label}</span>
                    <span className="text-gray-800 font-medium text-sm">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">재고 현황을 한눈에 확인하세요</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <button
            key={i}
            onClick={s.onClick}
            className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md hover:border-blue-200 transition-all text-left w-full group"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium group-hover:text-blue-600 transition-colors">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon size={20} className={s.color} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 위치별 현황 */}
      {data.locationSummary.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-gray-400" />
            <h2 className="font-bold text-gray-900">위치별 재고 현황</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {data.locationSummary.filter(loc => loc.locationId === 1 || loc.locationId === 2).map((loc) => (
              <button
                key={loc.locationId}
                onClick={() => onNavigate?.("status", loc.locationId)}
                className="bg-white rounded-2xl border border-gray-100 p-4 text-left hover:shadow-md hover:border-blue-200 transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-sm font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
                    {loc.locationName}
                  </span>
                  {loc.shortageCount > 0 && (
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  )}
                </div>
                <p className="text-xl font-bold text-gray-900">{loc.totalItems}<span className="text-sm font-normal text-gray-400 ml-1">종</span></p>
                <p className={`text-xs mt-1 font-medium ${loc.shortageCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {loc.shortageCount > 0 ? `⚠ 부족 ${loc.shortageCount}건` : "정상"}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">최근 입출고 내역</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {data.recent.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">최근 내역이 없습니다</div>
          ) : (
            data.recent.map((item) => {
              const tc = TYPE_COLORS[item.type as keyof typeof TYPE_COLORS];
              const cc = CATEGORY_COLORS[item.category as keyof typeof CATEGORY_COLORS] || "";
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedRecent(item)}
                  className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${tc?.dot || "bg-gray-400"}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{item.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cc}`}>{item.category}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{item.date} · {item.partner}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${tc?.text || "text-gray-700"}`}>
                      {item.type === "입고" ? "+" : "-"}{item.qty}개
                    </span>
                    <p className="text-xs text-gray-400">{formatPrice(item.amount)}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
