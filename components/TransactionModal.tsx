"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { TYPE_COLORS, CATEGORY_COLORS } from "@/lib/data";

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionModal({ isOpen, onClose }: TransactionModalProps) {
  const [type, setType] = useState<"입고" | "출고" | "불출">("입고");
  const [category, setCategory] = useState("웨이퍼");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">새 기록 작성</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 구분 선택 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">구분</label>
            <div className="flex gap-2">
              {(["입고", "출고", "불출"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    type === t
                      ? `${TYPE_COLORS[t].bg} ${TYPE_COLORS[t].text} ${TYPE_COLORS[t].border} border-2 shadow-sm`
                      : "bg-gray-50 text-gray-500 border-2 border-transparent hover:bg-gray-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 날짜 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">날짜</label>
            <input type="date" defaultValue="2026-03-11" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>

          {/* 품목군 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">품목군</label>
            <div className="flex gap-2 flex-wrap">
              {["웨이퍼", "타겟", "가스", "기자재/소모품"].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    category === c
                      ? `${CATEGORY_COLORS[c]} shadow-sm ring-1 ring-gray-200`
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* 바코드 (출고/불출 시) */}
          {(type === "출고" || type === "불출") && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">바코드 스캔</label>
              <div className="flex gap-2">
                <input type="text" placeholder="바코드를 스캔하거나 입력하세요" className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                <button className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors whitespace-nowrap">
                  목록에서 선택
                </button>
              </div>
            </div>
          )}

          {/* 품목코드 / 품목명 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">품목코드</label>
              <div className="flex gap-2">
                <input type="text" placeholder="자동 입력" readOnly className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                <button className="px-3 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors whitespace-nowrap">
                  선택
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">품목명</label>
              <input type="text" placeholder="자동 입력" readOnly className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          {/* 수량 / 단가 / 금액 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">수량 <span className="text-rose-500">*</span></label>
              <input type="number" placeholder="0" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">단가</label>
              <input type="text" placeholder="₩0" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">금액</label>
              <input type="text" placeholder="자동 계산" readOnly className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          {/* 거래처 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {type === "불출" ? "불출처" : "거래처"}
            </label>
            <select className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
              <option value="">선택하세요</option>
              <option>(주)실리콘밸리</option>
              <option>삼성전자</option>
              <option>에어코리아</option>
            </select>
          </div>

          {/* 비고 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">비고</label>
            <textarea placeholder="메모 입력 (선택사항)" rows={2} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            취소
          </button>
          <button className="px-5 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors shadow-sm">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
