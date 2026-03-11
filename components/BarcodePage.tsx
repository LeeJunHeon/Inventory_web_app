"use client";

import { useState } from "react";
import { Search, Plus, Edit, Trash2, Printer, QrCode, Check, X } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/data";

interface BarcodeItem {
  id: number;
  code: string;
  itemCode: string;
  itemName: string;
  category: string;
  targetId: string;
  isActive: boolean;
}

const SAMPLE_BARCODES: BarcodeItem[] = [
  { id: 1, code: "W-0042", itemCode: "W4P0BT-89", itemName: '4" P-type Boron 웨이퍼', category: "웨이퍼", targetId: "", isActive: true },
  { id: 2, code: "W-0038", itemCode: "W6P0SB-45", itemName: '6" P-type Sb 웨이퍼', category: "웨이퍼", targetId: "", isActive: true },
  { id: 3, code: "T-0187", itemCode: "T-AU-3N", itemName: "Au Target 3N 2인치", category: "타겟", targetId: "TU-001", isActive: true },
  { id: 4, code: "T-0188", itemCode: "T-TI-4N", itemName: "Ti Target 4N 3인치", category: "타겟", targetId: "TU-002", isActive: true },
  { id: 5, code: "T-0185", itemCode: "T-AL-4N", itemName: "Al Target 4N 2인치", category: "타겟", targetId: "TU-003", isActive: false },
  { id: 6, code: "G-0023", itemCode: "G-AR-HP", itemName: "Ar 고순도 가스 (99.999%)", category: "가스", targetId: "", isActive: true },
  { id: 7, code: "G-0024", itemCode: "G-N2-UHP", itemName: "N₂ 초고순도 가스", category: "가스", targetId: "", isActive: true },
  { id: 8, code: "E-0011", itemCode: "E-GLV-CR", itemName: "클린룸 장갑 (M)", category: "기자재/소모품", targetId: "", isActive: true },
];

const CATS = ["전체", "웨이퍼", "타겟", "가스", "기자재/소모품"];

export default function BarcodePage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [showCreate, setShowCreate] = useState(false);

  const filtered = SAMPLE_BARCODES.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch = !search || b.code.toLowerCase().includes(q) || b.itemCode.toLowerCase().includes(q) || b.itemName.toLowerCase().includes(q);
    const matchCat = categoryFilter === "전체" || b.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">바코드 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">바코드 조회, 생성, 출력을 관리합니다</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors shadow-sm"
        >
          <Plus size={16} />
          새 바코드 생성
        </button>
      </div>

      {/* 바코드 생성 패널 */}
      {showCreate && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-bold text-blue-900">새 바코드 생성</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">품목군</label>
              <select className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                <option>웨이퍼</option><option>타겟</option><option>가스</option><option>기자재/소모품</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">품목코드</label>
              <div className="flex gap-1">
                <input type="text" placeholder="자동 입력" readOnly className="flex-1 px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-sm" />
                <button className="px-3 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-semibold">선택</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">물질명 (타겟)</label>
              <input type="text" placeholder="예: Au 2&quot; 0.125t" className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600">
                <QrCode size={16} />
                생성 + 저장
              </button>
              <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-600 text-white rounded-xl text-sm font-semibold hover:bg-gray-700">
                <Printer size={16} />
                출력
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 검색 + 필터 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="바코드, 품목코드, 품목명 검색..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 overflow-x-auto">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${categoryFilter === c ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 바코드 목록 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* 데스크탑 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">바코드</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목코드</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목명</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목군</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">타겟ID</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">활성</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors group">
                  <td className="px-5 py-3 text-sm text-gray-400">{b.id}</td>
                  <td className="px-5 py-3 text-sm font-mono font-semibold text-gray-900">{b.code}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{b.itemCode}</td>
                  <td className="px-5 py-3 text-sm text-gray-900">{b.itemName}</td>
                  <td className="px-5 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[b.category]}`}>{b.category}</span></td>
                  <td className="px-5 py-3 text-sm text-gray-500 font-mono">{b.targetId || "-"}</td>
                  <td className="px-5 py-3 text-center">
                    {b.isActive
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><Check size={12} />활성</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"><X size={12} />비활성</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded-lg hover:bg-blue-100 text-gray-400 hover:text-blue-600" title="수정"><Edit size={15} /></button>
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="출력"><Printer size={15} /></button>
                      <button className="p-1.5 rounded-lg hover:bg-rose-100 text-gray-400 hover:text-rose-600" title="삭제"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 */}
        <div className="md:hidden divide-y divide-gray-50">
          {filtered.map((b) => (
            <div key={b.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-bold text-gray-900">{b.code}</span>
                <div className="flex items-center gap-2">
                  {b.isActive
                    ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">활성</span>
                    : <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">비활성</span>}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[b.category]}`}>{b.category}</span>
                </div>
              </div>
              <p className="text-sm text-gray-700">{b.itemName}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{b.itemCode}{b.targetId ? ` · ${b.targetId}` : ""}</span>
                <div className="flex gap-1">
                  <button className="p-2 rounded-lg hover:bg-blue-50 text-gray-400"><Edit size={16} /></button>
                  <button className="p-2 rounded-lg hover:bg-gray-50 text-gray-400"><Printer size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">총 <span className="font-semibold text-gray-700">{filtered.length}건</span></p>
        </div>
      </div>
    </div>
  );
}
