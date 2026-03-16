"use client";

import { useState, useEffect } from "react";
import { Search, Save, AlertTriangle, Weight, MapPin, FileText, ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import { TARGET_STATUS_LABELS, formatWeight } from "@/lib/data";

interface TargetInfo { id: number; barcodeCode: string; itemCode: string; itemName: string; materialName: string; status: string; memo: string; }
interface LogItem { id: number; targetId: number; timestamp: string; type: string; weight: number | null; location: string; reason: string; userName: string; barcodeCode: string; itemName: string; }

export default function TargetUsagePage() {
  const [barcodeInput, setBarcodeInput]     = useState("");
  const [selectedTarget, setSelectedTarget] = useState<TargetInfo | null>(null);
  const [logs, setLogs]                     = useState<LogItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [weight, setWeight]                 = useState("");
  const [location, setLocation]             = useState("");
  const [reason, setReason]                 = useState("");
  const [sortField, setSortField]           = useState("timestamp");
  const [sortDir, setSortDir]               = useState<"asc" | "desc">("desc");
  const [saving, setSaving]                 = useState(false);
  const [disposeConfirm, setDisposeConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/targets");
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSearch = async () => {
    const code = barcodeInput.trim();
    if (!code) { setSelectedTarget(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/targets?barcode=${encodeURIComponent(code)}`);
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "조회 실패");
        setSelectedTarget(null); return;
      }
      const data = await res.json();
      setSelectedTarget(data.target);
      setLogs(data.logs || []);
    } catch { alert("조회 중 오류 발생"); }
    finally { setLoading(false); }
  };

  // 무게 측정값 저장
  const handleSaveWeight = async () => {
    if (!selectedTarget || !weight) { alert("무게를 입력하세요"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUnitId: selectedTarget.id, type: "측정", weight: parseFloat(weight), location, reason }),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error || "저장 실패"); return; }
      setWeight(""); setLocation(""); setReason("");
      handleSearch();
    } catch { alert("저장 실패"); }
    finally { setSaving(false); }
  };

  // 타겟 정보 저장 (materialName 등 메타 업데이트)
  const handleSaveInfo = async () => {
    if (!selectedTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/targets/${selectedTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialName: selectedTarget.materialName }),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error || "저장 실패"); return; }
      alert("저장되었습니다.");
    } catch { alert("저장 실패"); }
    finally { setSaving(false); }
  };

  // 폐기 처리
  const handleDispose = async () => {
    if (!selectedTarget) return;
    if (!disposeConfirm) { setDisposeConfirm(true); return; } // 첫 클릭: 확인 요청
    setSaving(true);
    try {
      const res = await fetch(`/api/targets/${selectedTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disposed" }),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error || "폐기 처리 실패"); return; }
      // 폐기 로그도 함께 기록
      await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUnitId: selectedTarget.id, type: "폐기", weight: weight ? parseFloat(weight) : null, location, reason: reason || "수명 종료 폐기" }),
      });
      setDisposeConfirm(false);
      handleSearch();
    } catch { alert("처리 실패"); }
    finally { setSaving(false); }
  };

  const sorted = [...logs].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "timestamp") return a.timestamp.localeCompare(b.timestamp) * dir;
    if (sortField === "weight") return ((a.weight ?? 0) - (b.weight ?? 0)) * dir;
    return 0;
  });

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
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
            <input type="text" placeholder="타겟 바코드를 스캔하거나 입력 (예: T-0187)"
              value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <button onClick={handleSearch} className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600">조회</button>
        </div>
      </div>

      {/* 타겟 정보 + 측정 입력 */}
      {selectedTarget && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 타겟 정보 카드 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">타겟 정보</h2>
              {statusInfo && <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-gray-400 mb-1">타겟 ID</p><p className="text-sm font-semibold text-gray-900">{selectedTarget.id}</p></div>
              <div><p className="text-xs text-gray-400 mb-1">바코드</p><p className="text-sm font-mono font-semibold text-gray-900">{selectedTarget.barcodeCode}</p></div>
              <div><p className="text-xs text-gray-400 mb-1">품목코드</p><p className="text-sm text-gray-700">{selectedTarget.itemCode}</p></div>
              <div><p className="text-xs text-gray-400 mb-1">품목명</p><p className="text-sm text-gray-700">{selectedTarget.itemName}</p></div>
              <div className="col-span-2">
                <p className="text-xs text-gray-400 mb-1">물질명</p>
                <input type="text" value={selectedTarget.materialName}
                  onChange={e => setSelectedTarget({ ...selectedTarget, materialName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <div className="flex gap-2">
              {/* ✅ 정보 저장 버튼 연결 */}
              <button onClick={handleSaveInfo} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
                <Save size={16} />정보 저장
              </button>
              {/* ✅ 폐기 처리 버튼 연결 (2번 클릭 확인) */}
              {selectedTarget.status !== "disposed" && (
                <button onClick={handleDispose} disabled={saving}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 transition-all ${
                    disposeConfirm
                      ? "bg-rose-600 text-white hover:bg-rose-700 animate-pulse"
                      : "bg-rose-500 text-white hover:bg-rose-600"
                  }`}>
                  <AlertTriangle size={16} />{disposeConfirm ? "확인 (재클릭)" : "폐기 처리"}
                </button>
              )}
            </div>
            {disposeConfirm && (
              <p className="text-xs text-rose-500 text-center">한 번 더 클릭하면 폐기 처리됩니다. <button onClick={() => setDisposeConfirm(false)} className="underline">취소</button></p>
            )}
          </div>

          {/* 무게 측정 입력 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-900">무게 측정 기록</h2>
            <div>
              <label className="block text-xs text-gray-400 mb-1"><span className="inline-flex items-center gap-1"><Weight size={12} />무게 (g)</span></label>
              <input type="text" placeholder="예: 182.450" value={weight} onChange={(e) => setWeight(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1"><span className="inline-flex items-center gap-1"><MapPin size={12} />사용/보관처</span></label>
              <select value={location} onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none">
                <option value="">선택하세요</option>
                <option>Chamber-A</option><option>Chamber-B</option><option>Storage-A</option><option>Storage-B</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1"><span className="inline-flex items-center gap-1"><FileText size={12} />사유</span></label>
              <input type="text" placeholder="예: 공정 후 측정" value={reason} onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={handleSaveWeight} disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
              <Save size={16} />{saving ? "저장 중..." : "측정값 저장"}
            </button>
          </div>
        </div>
      )}

      {/* 로그 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{selectedTarget ? `${selectedTarget.barcodeCode} 측정 기록` : "전체 타겟 측정 기록"}</h2>
          <span className="text-xs text-gray-400">{sorted.length}건</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("timestamp")}><div className="flex items-center gap-1">시간 <SortIcon field="timestamp" /></div></th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">구분</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("weight")}><div className="flex items-center justify-end gap-1">무게(g) <SortIcon field="weight" /></div></th>
                {!selectedTarget && <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목명</th>}
                {!selectedTarget && <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">바코드</th>}
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">보관처</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">사유</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">작성자</th>
              </tr></thead>
              <tbody>
                {sorted.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                    <td className="px-5 py-3 text-sm text-gray-600">{log.timestamp}</td>
                    <td className="px-5 py-3"><span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${log.type === "폐기" ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}>{log.type}</span></td>
                    <td className="px-5 py-3 text-sm text-right font-mono font-semibold text-gray-900">{formatWeight(log.weight)}</td>
                    {!selectedTarget && <td className="px-5 py-3 text-sm text-gray-600">{log.itemName}</td>}
                    {!selectedTarget && <td className="px-5 py-3 text-sm font-mono text-gray-500">{log.barcodeCode}</td>}
                    <td className="px-5 py-3 text-sm text-gray-600">{log.location}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{log.reason}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{log.userName}</td>
                  </tr>
                ))}
                {sorted.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">측정 기록이 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
