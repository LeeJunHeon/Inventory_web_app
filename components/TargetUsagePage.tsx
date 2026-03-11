"use client";

import { useState } from "react";
import { Search, Save, AlertTriangle, Weight, MapPin, FileText, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { SAMPLE_TARGETS, SAMPLE_TARGET_LOGS, TARGET_STATUS_LABELS, formatWeight, TargetUnit, TargetLog } from "@/lib/data";

export default function TargetUsagePage() {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<TargetUnit | null>(null);
  const [logs, setLogs] = useState<TargetLog[]>(SAMPLE_TARGET_LOGS);
  const [weight, setWeight] = useState("");
  const [location, setLocation] = useState("");
  const [reason, setReason] = useState("");
  const [sortField, setSortField] = useState("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSearch = () => {
    const code = barcodeInput.trim().toUpperCase();
    if (!code) {
      setSelectedTarget(null);
      return;
    }
    const found = SAMPLE_TARGETS.find((t) => t.barcodeCode.toUpperCase() === code);
    if (found) {
      setSelectedTarget(found);
    } else {
      alert(`바코드 [${code}]를 찾을 수 없습니다.`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const filteredLogs = (selectedTarget
    ? logs.filter((l) => l.targetId === selectedTarget.id)
    : logs
  ).sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "timestamp") return a.timestamp.localeCompare(b.timestamp) * dir;
    if (sortField === "weight") return ((a.weight ?? 0) - (b.weight ?? 0)) * dir;
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

  const statusInfo = selectedTarget ? TARGET_STATUS_LABELS[selectedTarget.status] : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">타겟 사용현황</h1>
        <p className="text-sm text-gray-500 mt-1">바코드로 타겟을 조회하고, 무게 측정 / 상태 / 폐기를 관리합니다</p>
      </div>

      {/* 바코드 조회 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">바코드 조회</label>
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="타겟 바코드를 스캔하거나 입력하세요 (예: T-0187)"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <button onClick={handleSearch} className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors">
            조회
          </button>
        </div>
      </div>

      {/* 타겟 정보 + 측정 입력 (2컬럼) */}
      {selectedTarget && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 좌: 타겟 기본 정보 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">타겟 정보</h2>
              {statusInfo && (
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">타겟 ID</p>
                <p className="text-sm font-semibold text-gray-900">{selectedTarget.id}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">바코드</p>
                <p className="text-sm font-mono font-semibold text-gray-900">{selectedTarget.barcodeCode}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">품목코드</p>
                <p className="text-sm text-gray-700">{selectedTarget.itemCode}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">품목명</p>
                <p className="text-sm text-gray-700">{selectedTarget.itemName}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-400 mb-1">물질명</p>
                <p className="text-sm text-gray-700">{selectedTarget.materialName}</p>
              </div>
            </div>

            {/* 상태 변경 */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">상태 변경</label>
              <select
                defaultValue={selectedTarget.status}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="available">사용가능</option>
                <option value="using">사용중</option>
                <option value="disposed">폐기</option>
              </select>
            </div>

            {/* 비고 */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">비고</label>
              <textarea
                defaultValue={selectedTarget.memo}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors">
                <Save size={16} />
                정보 저장
              </button>
              {selectedTarget.status !== "disposed" && (
                <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-semibold hover:bg-rose-600 transition-colors">
                  <AlertTriangle size={16} />
                  폐기 처리
                </button>
              )}
            </div>
          </div>

          {/* 우: 무게 측정 입력 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-900">무게 측정 기록</h2>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                <span className="inline-flex items-center gap-1"><Weight size={12} /> 무게 (g)</span>
              </label>
              <input
                type="text"
                placeholder="예: 182.450"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                <span className="inline-flex items-center gap-1"><MapPin size={12} /> 사용/보관처</span>
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">선택하세요</option>
                <option value="Chamber-A">Chamber-A</option>
                <option value="Chamber-B">Chamber-B</option>
                <option value="Storage-A">Storage-A</option>
                <option value="Storage-B">Storage-B</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                <span className="inline-flex items-center gap-1"><FileText size={12} /> 사유</span>
              </label>
              <input
                type="text"
                placeholder="예: 공정 후 측정, 보관 이동, 세정 후 측정"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors">
              <Save size={16} />
              측정값 저장
            </button>

            {/* 최근 무게 변화 미니 요약 */}
            {selectedTarget && (() => {
              const targetLogs = logs.filter((l) => l.targetId === selectedTarget.id && l.weight !== null).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
              if (targetLogs.length < 2) return null;
              const latest = targetLogs[0].weight!;
              const prev = targetLogs[1].weight!;
              const diff = latest - prev;
              return (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">최근 무게 변화</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-gray-900">{latest.toFixed(3)}g</span>
                    <span className={`text-sm font-semibold ${diff < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                      {diff < 0 ? "" : "+"}{diff.toFixed(3)}g
                    </span>
                    <span className="text-xs text-gray-400">vs 이전</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 로그 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">
            {selectedTarget ? `${selectedTarget.barcodeCode} 측정 기록` : "전체 타겟 측정 기록"}
          </h2>
          <span className="text-xs text-gray-400">{filteredLogs.length}건</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("timestamp")}>
                  <div className="flex items-center gap-1">시간 <SortIcon field="timestamp" /></div>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">구분</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("weight")}>
                  <div className="flex items-center justify-end gap-1">무게(g) <SortIcon field="weight" /></div>
                </th>
                {!selectedTarget && <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목명</th>}
                {!selectedTarget && <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">바코드</th>}
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">보관처</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">사유</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">작성자</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                  <td className="px-5 py-3 text-sm text-gray-600">{log.timestamp}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                      log.type === "폐기"
                        ? "bg-rose-50 text-rose-700"
                        : log.type === "상태변경"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-blue-50 text-blue-700"
                    }`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-right font-mono font-semibold text-gray-900">
                    {formatWeight(log.weight)}
                  </td>
                  {!selectedTarget && <td className="px-5 py-3 text-sm text-gray-600">{log.itemName}</td>}
                  {!selectedTarget && <td className="px-5 py-3 text-sm font-mono text-gray-500">{log.barcodeCode}</td>}
                  <td className="px-5 py-3 text-sm text-gray-600">{log.location}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{log.reason}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{log.userName}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    {selectedTarget ? "이 타겟의 측정 기록이 없습니다" : "측정 기록이 없습니다"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
