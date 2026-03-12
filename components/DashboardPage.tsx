"use client";

import { TrendingUp, TrendingDown, AlertTriangle, Boxes, Loader2 } from "lucide-react";
import { TYPE_COLORS, CATEGORY_COLORS, formatPrice } from "@/lib/data";
import { useApi } from "@/lib/useApi";

interface DashboardData {
  todayIn: { count: number; amount: number };
  todayOut: { count: number; amount: number };
  shortageCount: number;
  totalItems: number;
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
  recent: [],
};

export default function DashboardPage() {
  const { data, loading } = useApi<DashboardData>("/api/dashboard", DEFAULT);

  const stats = [
    { label: "오늘 입고", value: `${data.todayIn.count}건`, sub: formatPrice(data.todayIn.amount), icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "오늘 출고", value: `${data.todayOut.count}건`, sub: formatPrice(data.todayOut.amount), icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50" },
    { label: "재고 부족 품목", value: `${data.shortageCount}건`, sub: "확인 필요", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "총 보유 품목", value: `${data.totalItems}종`, sub: "4개 품목군", icon: Boxes, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-blue-500" />
        <span className="ml-2 text-sm text-gray-500">로딩 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">재고 현황을 한눈에 확인하세요</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon size={20} className={s.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

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
                <div key={item.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
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
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
