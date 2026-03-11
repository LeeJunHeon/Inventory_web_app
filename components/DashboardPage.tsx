"use client";

import { TrendingUp, TrendingDown, AlertTriangle, Boxes } from "lucide-react";
import { SAMPLE_INVENTORY, TYPE_COLORS, CATEGORY_COLORS, formatPrice } from "@/lib/data";

export default function DashboardPage() {
  const stats = [
    { label: "오늘 입고", value: "3건", sub: "₩12,820,000", icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "오늘 출고", value: "2건", sub: "₩5,480,000", icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50" },
    { label: "재고 부족 품목", value: "4건", sub: "확인 필요", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "총 보유 품목", value: "128종", sub: "4개 품목군", icon: Boxes, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  const recentItems = SAMPLE_INVENTORY.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">재고 현황을 한눈에 확인하세요</p>
      </div>

      {/* 통계 카드 */}
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

      {/* 최근 기록 */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">최근 입출고 내역</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {recentItems.map((item) => (
            <div key={item.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${TYPE_COLORS[item.type].dot}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{item.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category]}`}>{item.category}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{item.date} · {item.partner}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold ${TYPE_COLORS[item.type].text}`}>
                  {item.type === "입고" ? "+" : "-"}{item.qty}개
                </span>
                <p className="text-xs text-gray-400">{formatPrice(item.amount)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
