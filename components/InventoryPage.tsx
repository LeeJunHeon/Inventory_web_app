"use client";

import { useState } from "react";
import { Search, Plus, Download, Edit, Trash2, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { SAMPLE_INVENTORY, CATEGORIES, TYPES, TYPE_COLORS, CATEGORY_COLORS, formatPrice, formatQty } from "@/lib/data";
import TransactionModal from "./TransactionModal";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [modalOpen, setModalOpen] = useState(false);
  const [sortField, setSortField] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = SAMPLE_INVENTORY.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch = !search || item.name.includes(search) || item.code.toLowerCase().includes(q) || item.barcode.toLowerCase().includes(q);
    const matchType = typeFilter === "전체" || item.type === typeFilter;
    const matchCat = categoryFilter === "전체" || item.category === categoryFilter;
    return matchSearch && matchType && matchCat;
  }).sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "id") return (a.id - b.id) * dir;
    if (sortField === "date") return a.date.localeCompare(b.date) * dir;
    if (sortField === "qty") return (a.qty - b.qty) * dir;
    if (sortField === "amount") return (a.amount - b.amount) * dir;
    return 0;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-gray-300" />;
    return sortDir === "asc" ? <ArrowUp size={14} className="text-blue-500" /> : <ArrowDown size={14} className="text-blue-500" />;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">재고 관리</h1>
          <p className="text-sm text-gray-500 mt-1">입고 / 출고 / 불출 기록을 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <Download size={16} />
            내보내기
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors shadow-sm"
          >
            <Plus size={16} />
            새 기록
          </button>
        </div>
      </div>

      {/* 필터 영역 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="품목명, 품목코드, 바코드로 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl p-1">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  typeFilter === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl p-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  categoryFilter === c ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => handleSort("id")}>
                  <div className="flex items-center gap-1">ID <SortIcon field="id" /></div>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => handleSort("date")}>
                  <div className="flex items-center gap-1">날짜 <SortIcon field="date" /></div>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">구분</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목군</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">바코드</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => handleSort("qty")}>
                  <div className="flex items-center justify-end gap-1">수량 <SortIcon field="qty" /></div>
                </th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => handleSort("amount")}>
                  <div className="flex items-center justify-end gap-1">금액 <SortIcon field="amount" /></div>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">거래처</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors group">
                  <td className="px-5 py-3.5 text-sm text-gray-500 font-mono">{item.id}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{item.date}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${TYPE_COLORS[item.type].bg} ${TYPE_COLORS[item.type].text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${TYPE_COLORS[item.type].dot}`} />
                      {item.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category]}`}>{item.category}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500 font-mono">{item.barcode || "-"}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.code}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-right font-semibold text-gray-900">{formatQty(item.qty)}</td>
                  <td className="px-5 py-3.5 text-sm text-right text-gray-600">{formatPrice(item.amount)}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{item.partner}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded-lg hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors" title="수정">
                        <Edit size={15} />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-rose-100 text-gray-400 hover:text-rose-600 transition-colors" title="삭제">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            총 <span className="font-semibold text-gray-700">{filtered.length}건</span> 표시 중
          </p>
          <p className="text-xs text-gray-400">
            금액 합계: <span className="font-semibold text-gray-600">{formatPrice(filtered.reduce((s, i) => s + i.amount, 0))}</span>
          </p>
        </div>
      </div>

      <TransactionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
