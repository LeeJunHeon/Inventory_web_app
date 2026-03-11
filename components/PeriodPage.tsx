"use client";

import { useState } from "react";
import { Search, Download, Calendar } from "lucide-react";
import { SAMPLE_INVENTORY, TYPE_COLORS, CATEGORY_COLORS, formatPrice, formatQty } from "@/lib/data";

export default function PeriodPage() {
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState("2026-03-11");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [searched, setSearched] = useState(false);

  const filtered = SAMPLE_INVENTORY.filter((item) => {
    const d = item.date.replace(/\./g, "-");
    const matchDate = d >= startDate && d <= endDate;
    const matchCat = categoryFilter === "전체" || item.category === categoryFilter;
    return matchDate && matchCat;
  });

  const summary = {
    입고: { count: 0, qty: 0, amount: 0 },
    출고: { count: 0, qty: 0, amount: 0 },
    불출: { count: 0, qty: 0, amount: 0 },
  };
  filtered.forEach((item) => {
    const s = summary[item.type];
    s.count++;
    s.qty += item.qty;
    s.amount += item.amount;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">기간별 조회</h1>
        <p className="text-sm text-gray-500 mt-0.5">기간을 지정하여 입출고 내역을 조회합니다</p>
      </div>

      {/* 조회 조건 */}
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
              <option>전체</option>
              <option>웨이퍼</option>
              <option>타겟</option>
              <option>가스</option>
              <option>기자재/소모품</option>
            </select>
          </div>
          <button onClick={() => setSearched(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors">
            <Search size={16} />
            조회
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            <Download size={16} />
            CSV
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(["입고", "출고", "불출"] as const).map((type) => (
          <div key={type} className={`rounded-2xl border p-4 ${TYPE_COLORS[type].bg} ${TYPE_COLORS[type].border}`}>
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

      {/* 상세 내역 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">상세 내역</h2>
          <span className="text-xs text-gray-400">{filtered.length}건</span>
        </div>

        {/* 데스크탑 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">날짜</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">구분</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">품목군</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">품목</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5">수량</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-2.5">금액</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">거래처</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">비고</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                  <td className="px-5 py-3 text-sm text-gray-600">{item.date}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${TYPE_COLORS[item.type].bg} ${TYPE_COLORS[item.type].text}`}>{item.type}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category]}`}>{item.category}</span>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.code}</p>
                  </td>
                  <td className="px-5 py-3 text-sm text-right font-semibold">{formatQty(item.qty)}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">{formatPrice(item.amount)}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{item.partner}</td>
                  <td className="px-5 py-3 text-sm text-gray-400">{item.memo || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 */}
        <div className="md:hidden divide-y divide-gray-50">
          {filtered.map((item) => (
            <div key={item.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${TYPE_COLORS[item.type].bg} ${TYPE_COLORS[item.type].text}`}>{item.type}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category]}`}>{item.category}</span>
                </div>
                <span className="text-xs text-gray-400">{item.date}</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{item.name}</p>
              <div className="flex items-center gap-4 text-sm">
                <span>수량 <span className="font-bold">{item.qty}</span></span>
                <span className="text-gray-400">{formatPrice(item.amount)}</span>
                <span className="text-gray-400 truncate max-w-[100px]">{item.partner}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-gray-400">조회된 데이터가 없습니다</div>
          )}
        </div>
      </div>
    </div>
  );
}
