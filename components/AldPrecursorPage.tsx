"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search, Save, Weight, MapPin, FileText, Loader2,
  Camera, RefreshCw, Pencil,
} from "lucide-react";
import BarcodeCameraScanner from "./BarcodeCameraScanner";
import CsvButton from "@/components/CsvButton";
import { useT } from "@/lib/i18n";
import { exportCSV } from "@/lib/csvUtils";
import { normalizeBarcodeInput } from "@/lib/barcodeUtils";

interface PortSlot {
  id: number;
  portNumber: number;
  canisterId: number | null;
  canisterCode: string | null;
  materialName: string | null;
  remainPercent: number | null;
  equipmentName: string;
  loadedAt: string | null;
  note: string | null;
}

interface CanisterInfo {
  id: number;
  barcodeCode: string;
  itemCode: string;
  itemName: string;
  materialName: string;
  status: string;
  tareWeight: number | null;
  initialGrossWeight: number | null;
}

interface AldLogItem {
  id: number;
  canisterId: number;
  timestamp: string;
  logSubType: string;
  materialName: string;
  grossWeight: number | null;
  tareWeight: number | null;
  measureWeight: number | null;
  cumulativeCycle: number | null;
  cycleDelta: number | null;
  consumptionPerCycle: number | null;
  remainPercent: number | null;
  estimatedRemainCycle: number | null;
  location: string;
  reason: string;
  userName: string;
}

const PAGE_LIMIT = 50;

export default function AldPrecursorPage() {
  const { t } = useT();

  // ─── 대시보드 포트 데이터 ───
  const [ncdPorts, setNcdPorts]       = useState<PortSlot[]>([]);
  const [rayvacPorts, setRayvacPorts] = useState<PortSlot[]>([]);

  // ─── 포트 슬롯 편집 ───
  const [editingPort, setEditingPort] = useState<PortSlot | null>(null);
  const [allCanisters, setAllCanisters] = useState<CanisterInfo[]>([]);
  const [portSelectedCanister, setPortSelectedCanister] = useState<CanisterInfo | null>(null);
  const [portSaving, setPortSaving] = useState(false);

  // ─── 검색 ───
  const [searchType, setSearchType] = useState<"바코드" | "품목코드" | "물질명">("바코드");
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // ─── Canister / 로그 ───
  const [selectedCanister, setSelectedCanister] = useState<CanisterInfo | null>(null);
  const [logs, setLogs] = useState<AldLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [loading, setLoading] = useState(false);

  // ─── 측정 입력 ───
  const [logSubType, setLogSubType] = useState<"측정" | "충진">("측정");
  const [measureWeight, setMeasureWeight] = useState("");
  const [consumptionPerCycle, setConsumptionPerCycle] = useState("");
  const [cumulativeCycle, setCumulativeCycle] = useState("");
  const [slotId,     setSlotId]     = useState<number | "">("");
  const [locationId, setLocationId] = useState<number | "">("");
  const [locationOptions, setLocationOptions] = useState<{ id: number; name: string }[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [weightError, setWeightError] = useState("");

  // ─── UX ───
  const [toast, setToast] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  useEffect(() => {
    setIsMobile(
      typeof navigator !== "undefined" &&
        (navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent))
    );
  }, []);

  const fetchPortSlots = async () => {
    try {
      const res = await fetch("/api/ald/port-slots");
      if (!res.ok) return;
      const slots: PortSlot[] = await res.json();
      setNcdPorts(slots.filter(s => s.equipmentName === "NCD-1"));
      setRayvacPorts(slots.filter(s => s.equipmentName === "Rayvac-1"));
    } catch {}
  };

  useEffect(() => {
    fetchPortSlots();
    fetchLogs(1);   // 마운트 시 전체 ALD 로그 로드
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/locations?type=ald")
      .then(r => r.ok ? r.json() : [])
      .then(data => setLocationOptions(data))
      .catch(() => {});
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleSearch = async () => {
    const q = barcodeInput.trim();
    if (!q) { setSearchError("검색어를 입력하세요."); barcodeInputRef.current?.focus(); return; }
    setSearchError("");
    setIsSearching(true);
    try {
      const param = searchType === "바코드"
        ? `barcode=${encodeURIComponent(q)}`
        : `search=${encodeURIComponent(q)}&type=${encodeURIComponent(searchType)}`;
      const res = await fetch(`/api/ald?${param}`);
      if (!res.ok) { const e = await res.json(); setSearchError(e.error || "조회 실패"); return; }
      const data = await res.json();
      // 단일 Canister 반환 (바코드 검색)
      const canister = Array.isArray(data) ? data[0] : data;
      if (!canister) { setSearchError("Canister를 찾을 수 없습니다."); return; }
      setSelectedCanister(canister);
      setMeasureWeight(""); setConsumptionPerCycle(""); setCumulativeCycle("");
      setReason(""); setLocationId(""); setWeightError("");
      // 로그 조회
      await fetchLogs(1, canister.id);
    } catch { setSearchError("조회 중 오류가 발생했습니다."); }
    finally { setIsSearching(false); }
  };

  const fetchLogs = async (p: number, cId?: number) => {
    const id = cId ?? selectedCanister?.id;
    setLoading(true);
    try {
      const url = id
        ? `/api/ald/logs?canisterId=${id}&page=${p}&limit=${PAGE_LIMIT}`
        : `/api/ald/logs?page=${p}&limit=${PAGE_LIMIT}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setPage(p);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchLogs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSave = async () => {
    if (!selectedCanister || !measureWeight) return;
    setWeightError("");
    setSaving(true);
    try {
      const res = await fetch("/api/ald/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canisterId:          selectedCanister.id,
          logSubType:          logSubType,
          materialName:        selectedCanister.materialName,
          measureWeight:       parseFloat(measureWeight),
          consumptionPerCycle: consumptionPerCycle ? parseFloat(consumptionPerCycle) : null,
          locationId:          locationId || null,
          slotId:              slotId || null,
          cumulativeCycle:     cumulativeCycle ? parseInt(cumulativeCycle) : null,
          reason,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setWeightError(e.error || t.ald.saveFailed);
        return;
      }
      showToast(t.ald.savedOk);
      setMeasureWeight(""); setConsumptionPerCycle(""); setCumulativeCycle("");
      setReason(""); setLocationId(""); setSlotId(""); setWeightError("");
      await fetchLogs(1);
      const r = await fetch(`/api/ald?barcode=${selectedCanister.barcodeCode}`);
      if (r.ok) setSelectedCanister(await r.json());
      await fetchPortSlots();
    } catch { showToast(t.ald.saveFailed); }
    finally { setSaving(false); }
  };

  // 포트에 Canister 배정
  const handlePortSave = async () => {
    if (!editingPort) return;
    setPortSaving(true);
    try {
      const res = await fetch("/api/ald/port-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId:     editingPort.id,
          canisterId: portSelectedCanister?.id ?? null,
        }),
      });
      if (!res.ok) { const e = await res.json(); showToast(e.error || "저장 실패"); return; }
      // 포트 데이터 새로고침
      await fetchPortSlots();
      showToast("저장되었습니다.");
      setEditingPort(null);
    } catch { showToast("저장 실패"); }
    finally { setPortSaving(false); }
  };

  // 포트 비우기
  const handlePortClear = () => {
    if (!editingPort) return;
    setPortSelectedCanister(null);
    const clearedSlot: PortSlot = {
      ...editingPort,
      canisterId: null,
      canisterCode: null,
      materialName: null,
      remainPercent: null,
    };
    if (editingPort.equipmentName === "NCD-1") {
      setNcdPorts(prev => prev.map(p => p.portNumber === editingPort.portNumber ? clearedSlot : p));
    } else {
      setRayvacPorts(prev => prev.map(p => p.portNumber === editingPort.portNumber ? clearedSlot : p));
    }
    setEditingPort(null);
    showToast("포트를 비웠습니다.");
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(prev => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortedLogs = sortKey
    ? [...logs].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey];
        const bv = (b as Record<string, unknown>)[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return sortAsc ? 1 : -1;
        if (bv == null) return sortAsc ? -1 : 1;
        return sortAsc
          ? (av < bv ? -1 : av > bv ? 1 : 0)
          : (av > bv ? -1 : av < bv ? 1 : 0);
      })
    : logs;

  const handleCsvExport = () => {
    if (logs.length === 0) return;
    exportCSV(
      ["시간","구분","물질명","Canister","Gross(g)","Tare(g)","Measure(g)","누적사이클","소모량(g/cyc)","잔여량(%)","추정잔여(cyc)","현위치","작성자"],
      logs.map((l) => [
        l.timestamp, l.logSubType, l.materialName, l.canisterId?.toString() ?? "",
        l.grossWeight ?? "", l.tareWeight ?? "", l.measureWeight ?? "",
        l.cumulativeCycle ?? "",
        l.consumptionPerCycle != null ? l.consumptionPerCycle.toFixed(4) : "",
        l.remainPercent != null ? l.remainPercent.toFixed(1) : "",
        l.estimatedRemainCycle ?? "", l.location, l.userName,
      ]),
      `ALD_${selectedCanister?.barcodeCode || "logs"}_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const remainColor = (pct: number | null) => {
    if (pct == null) return "bg-gray-200";
    if (pct > 30) return "bg-emerald-500";
    if (pct > 10) return "bg-amber-400";
    return "bg-red-500";
  };
  const remainTextColor = (pct: number | null) => {
    if (pct == null) return "text-gray-300";
    if (pct > 30) return "text-emerald-600";
    if (pct > 10) return "text-amber-500";
    return "text-red-500";
  };

  const renderEquipmentCard = (name: string, dotColor: string, ports: PortSlot[], onEditPort: (slot: PortSlot) => void) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <h2 className="font-bold text-gray-900">{name}</h2>
        </div>
        <span className="text-xs text-gray-400">{ports.length} Ports</span>
      </div>
      <div className="space-y-3">
        {ports.map((slot) => (
          <div key={slot.portNumber}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-gray-500 shrink-0">
                  {t.ald.portLabel} {slot.portNumber}
                </span>
                {slot.materialName && (
                  <span className="text-xs font-medium text-gray-800 truncate">{slot.materialName}</span>
                )}
                {slot.canisterCode && (
                  <span className="text-xs text-gray-400 font-mono truncate">{slot.canisterCode}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className={`text-xs font-bold ${remainTextColor(slot.remainPercent)}`}>
                  {slot.remainPercent != null ? `${slot.remainPercent.toFixed(1)}%` : "—"}
                </span>
                <button
                  onClick={() => onEditPort(slot)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                >
                  <Pencil size={12} />
                </button>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${remainColor(slot.remainPercent)}`}
                style={{ width: slot.remainPercent != null ? `${Math.min(slot.remainPercent, 100)}%` : "0%" }}
              />
            </div>
            {!slot.canisterCode && (
              <p className="text-xs text-gray-300 mt-0.5">{t.ald.emptyPort}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const portSlots = [...ncdPorts, ...rayvacPorts];

  return (
    <div className="space-y-5">
      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* 카메라 스캐너 */}
      {showCameraScanner && (
        <BarcodeCameraScanner
          onDetected={code => {
            setShowCameraScanner(false);
            setSearchType("바코드");
            setBarcodeInput(normalizeBarcodeInput(code));
            setTimeout(() => handleSearch(), 100);
          }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {/* ── 포트 편집 모달 ── */}
      {editingPort && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setEditingPort(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">
                {editingPort.equipmentName} · {t.ald.portLabel} {editingPort.portNumber} {t.ald.portEditTitle}
              </h3>
              <button
                onClick={() => setEditingPort(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-sm"
              >✕</button>
            </div>

            {/* 현재 장착 */}
            <div className="px-3 py-2.5 bg-gray-50 rounded-xl text-sm">
              <span className="text-xs text-gray-400">{t.ald.portCurrentLabel}: </span>
              <span className="font-semibold text-gray-800">
                {portSelectedCanister
                  ? `${portSelectedCanister.barcodeCode} · ${portSelectedCanister.materialName || "-"}`
                  : t.ald.portEmptySlot}
              </span>
            </div>

            {/* Canister 목록 선택 */}
            <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-1">
              {allCanisters.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">등록된 Canister가 없습니다</p>
              ) : allCanisters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setPortSelectedCanister(c)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    portSelectedCanister?.id === c.id
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{c.barcodeCode}</p>
                      <p className="text-xs text-gray-500">{c.materialName || "-"}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        c.status === "미사용" ? "bg-emerald-100 text-emerald-700" :
                        c.status === "사용중" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>{c.status}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* 버튼 */}
            <div className="flex gap-2">
              <button
                onClick={handlePortClear}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                {t.ald.portClearBtn}
              </button>
              <button
                onClick={handlePortSave}
                disabled={portSaving}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60"
              >
                {portSaving ? t.ald.portSaving : t.ald.portSaveBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 헤더 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.ald.pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{t.ald.subtitle}</p>
        </div>
      </div>

      {/* ── 대시보드 ── */}
      <div>
        <button
          onClick={() => setShowDashboard(prev => !prev)}
          className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 hover:text-gray-600 transition-colors"
        >
          {t.ald.dashboardTitle}
          <span className="text-gray-300">{showDashboard ? "▲" : "▼"}</span>
        </button>
        {showDashboard && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderEquipmentCard("NCD ALD", "bg-blue-500", ncdPorts, (slot) => {
              setEditingPort(slot);
              setPortSelectedCanister(
                slot.canisterId ? { id: slot.canisterId, barcodeCode: slot.canisterCode ?? "", itemCode: "", itemName: "", materialName: slot.materialName ?? "", status: "사용중", tareWeight: null, initialGrossWeight: null } : null
              );
              fetch("/api/ald")
                .then(r => r.ok ? r.json() : [])
                .then((data: CanisterInfo[]) => setAllCanisters(data))
                .catch(() => setAllCanisters([]));
            })}
            {renderEquipmentCard("Rayvac ALD", "bg-purple-500", rayvacPorts, (slot) => {
              setEditingPort(slot);
              setPortSelectedCanister(
                slot.canisterId ? { id: slot.canisterId, barcodeCode: slot.canisterCode ?? "", itemCode: "", itemName: "", materialName: slot.materialName ?? "", status: "사용중", tareWeight: null, initialGrossWeight: null } : null
              );
              fetch("/api/ald")
                .then(r => r.ok ? r.json() : [])
                .then((data: CanisterInfo[]) => setAllCanisters(data))
                .catch(() => setAllCanisters([]));
            })}
          </div>
        )}
      </div>

      {/* ── 바코드 검색 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">{t.ald.searchLabel}</label>
        <div className="flex gap-2">
          <select value={searchType} onChange={(e) => setSearchType(e.target.value as "바코드" | "품목코드" | "물질명")}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 shrink-0">
            <option value="바코드">{t.ald.searchTypeBarcode}</option>
            <option value="품목코드">{t.ald.searchTypeItemCode}</option>
            <option value="물질명">{t.ald.searchTypeItemName}</option>
          </select>
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={barcodeInputRef} type="text" value={barcodeInput}
              onChange={(e) => { setBarcodeInput(searchType === "바코드" ? normalizeBarcodeInput(e.target.value) : e.target.value); setSearchError(""); }}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={(e) => { isComposingRef.current = false; setBarcodeInput(searchType === "바코드" ? normalizeBarcodeInput(e.currentTarget.value) : e.currentTarget.value); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !isComposingRef.current) handleSearch(); }}
              placeholder={t.ald.barcodePlaceholder}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Loader2 size={14} className="animate-spin text-blue-500" />
              </div>
            )}
          </div>
          <button onClick={handleSearch} disabled={isSearching}
            className="shrink-0 flex items-center justify-center px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 whitespace-nowrap disabled:opacity-60">
            {isSearching ? <Loader2 size={16} className="animate-spin" /> : t.ald.searchBtn}
          </button>
          {selectedCanister && (
            <button
              onClick={() => {
                setSelectedCanister(null);
                setBarcodeInput("");
                fetchLogs(1);  // 전체 로그로 돌아가기
              }}
              className="shrink-0 px-3 py-2.5 bg-gray-100 text-gray-500 rounded-xl hover:bg-gray-200 text-xs"
            >
              전체
            </button>
          )}
          {isMobile && (
            <button onClick={() => setShowCameraScanner(true)}
              className="shrink-0 px-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200">
              <Camera size={18} />
            </button>
          )}
        </div>
        {searchError && <p className="mt-2 text-sm text-red-500">{searchError}</p>}
      </div>

      {/* ── Canister 정보 + 측정 입력 ── */}
      {selectedCanister && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          {/* Canister 정보 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">{t.ald.canisterInfoTitle}</h2>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                selectedCanister.status === "미사용" ? "bg-emerald-100 text-emerald-700" :
                selectedCanister.status === "사용중" ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-500"}`}>
                {selectedCanister.status}
              </span>
            </div>
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-1">{t.ald.barcodeLabel}</p>
                  <p className="text-xs font-mono text-gray-500">{selectedCanister.barcodeCode}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">{t.ald.materialLabel}</p>
                  <p className="text-base font-bold text-gray-900">{selectedCanister.materialName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">{t.ald.itemCodeLabel}</p>
                  <p className="text-sm text-gray-700 truncate">{selectedCanister.itemCode || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">{t.ald.tareLabel}</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedCanister.tareWeight != null ? `${selectedCanister.tareWeight.toFixed(3)} g` : "-"}
                  </p>
                </div>
              </div>
              {logs.length > 0 && logs[0].remainPercent != null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-400">{t.ald.colRemain}</p>
                    <p className={`text-sm font-bold ${remainTextColor(logs[0].remainPercent)}`}>
                      {logs[0].remainPercent.toFixed(1)}%
                    </p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full transition-all ${remainColor(logs[0].remainPercent)}`}
                      style={{ width: `${Math.min(logs[0].remainPercent, 100)}%` }} />
                  </div>
                  {logs[0].estimatedRemainCycle != null && (
                    <p className="text-xs text-gray-400 mt-1">
                      추정 잔여 {logs[0].estimatedRemainCycle.toLocaleString()} cycle
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 측정 입력 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
            <div className="flex-1 space-y-3">
              {/* Gross Weight — 참고용 표시만 */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {t.ald.grossWeightLabel}
                </label>
                <div className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
                  {selectedCanister.initialGrossWeight != null
                    ? `${Number(selectedCanister.initialGrossWeight).toFixed(3)} g`
                    : "-"}
                </div>
              </div>

              {/* Tare Weight — 참고용 표시만 */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t.ald.tareWeightInputLabel}</label>
                <div className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
                  {selectedCanister.tareWeight != null
                    ? `${selectedCanister.tareWeight.toFixed(3)} g`
                    : "-"}
                </div>
              </div>

              {/* Measure Weight — 직접 입력 */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Weight size={12} /> {t.ald.measureWeightLabel}
                    <span className="text-rose-500 ml-0.5">*</span>
                  </span>
                </label>
                <input
                  type="number" step="0.001"
                  value={measureWeight}
                  onChange={(e) => setMeasureWeight(e.target.value)}
                  placeholder="0.000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 사이클당 소모량 */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  사이클당 소모량 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number" step="0.001"
                  value={consumptionPerCycle}
                  onChange={(e) => setConsumptionPerCycle(e.target.value)}
                  placeholder="0.000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <RefreshCw size={12} /> {t.ald.cycleLabel}
                    <span className="text-rose-500">*</span>
                  </span>
                </label>
                <input type="number" value={cumulativeCycle} onChange={(e) => setCumulativeCycle(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  <span className="inline-flex items-center gap-1"><MapPin size={12} /> {t.ald.locationLabel}</span>
                </label>
                <select
                  value={slotId}
                  onChange={(e) => {
                    const sid = Number(e.target.value) || "";
                    setSlotId(sid);
                    // slotId로 locationId 자동 연결
                    if (sid) {
                      const slot = portSlots.find(s => s.id === Number(sid));
                      const loc  = locationOptions.find(l => l.name === slot?.equipmentName);
                      setLocationId(loc?.id || "");
                    } else {
                      setLocationId("");
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none"
                >
                  <option value="">선택</option>
                  {locationOptions.map(loc => (
                    <optgroup key={loc.id} label={loc.name}>
                      {portSlots
                        .filter(s => s.equipmentName === loc.name)
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            Port {s.portNumber}
                            {s.canisterCode
                              ? ` (${s.canisterCode} · ${s.materialName ?? "-"})`
                              : " (비어있음)"}
                          </option>
                        ))
                      }
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  <span className="inline-flex items-center gap-1"><FileText size={12} /> {t.ald.reasonLabel}</span>
                </label>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder={t.ald.reasonPlaceholder}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {weightError && <p className="text-xs text-red-500 flex items-center gap-1">{weightError}</p>}
            </div>
            <button onClick={handleSave} disabled={saving || !measureWeight || !consumptionPerCycle || !cumulativeCycle}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
              <Save size={16} />
              {saving ? <Loader2 size={16} className="animate-spin" /> : t.ald.saveBtn}
            </button>
          </div>
        </div>
      )}

      {/* ── 이력 테이블 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900">{t.ald.recordTitle}</h2>
              <span className="text-xs text-gray-400">{total}건</span>
            </div>
            <div className="flex items-center gap-2">
              <CsvButton onClick={handleCsvExport} disabled={logs.length === 0} />
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-2.5 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-40">이전</button>
              <span className="text-xs text-gray-500 min-w-[40px] text-center">{page}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page * PAGE_LIMIT >= total}
                className="px-2.5 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-40">다음</button>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[
                      { label: t.ald.colTime,           key: "timestamp" },
                      { label: t.ald.colSubType,        key: "logSubType" },
                      { label: t.ald.colMaterial,       key: "materialName" },
                      { label: t.ald.colCanister,       key: "canisterId" },
                      { label: t.ald.colGross,          key: "grossWeight" },
                      { label: t.ald.colTare,           key: "tareWeight" },
                      { label: t.ald.colMeasure,        key: "measureWeight" },
                      { label: t.ald.colCycle,          key: "cumulativeCycle" },
                      { label: t.ald.colConsumption,    key: "consumptionPerCycle" },
                      { label: t.ald.colRemain,         key: "remainPercent" },
                      { label: t.ald.colEstimatedCycle, key: "estimatedRemainCycle" },
                      { label: t.ald.colLocation,       key: "location" },
                      { label: t.ald.colAuthor,         key: "userName" },
                    ].map(({ label, key }) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap cursor-pointer hover:text-gray-800 select-none"
                      >
                        {label}
                        {sortKey === key ? (sortAsc ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedLogs.length === 0 ? (
                    <tr><td colSpan={13} className="px-5 py-12 text-center text-sm text-gray-400">{t.ald.noLogs}</td></tr>
                  ) : sortedLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{log.timestamp}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${log.logSubType === "충진" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                          {log.logSubType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{log.materialName || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono whitespace-nowrap">{selectedCanister.barcodeCode}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right font-mono whitespace-nowrap">{log.grossWeight != null ? log.grossWeight.toFixed(3) : "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right font-mono whitespace-nowrap">{log.tareWeight != null ? log.tareWeight.toFixed(3) : "-"}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right font-mono whitespace-nowrap">{log.measureWeight != null ? log.measureWeight.toFixed(3) : "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right whitespace-nowrap">{log.cumulativeCycle?.toLocaleString() ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right font-mono whitespace-nowrap">{log.consumptionPerCycle != null ? log.consumptionPerCycle.toFixed(4) : "-"}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {log.remainPercent != null ? (
                          <span className={`text-sm font-bold ${remainTextColor(log.remainPercent)}`}>
                            {log.remainPercent.toFixed(1)}%
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right whitespace-nowrap">{log.estimatedRemainCycle != null ? log.estimatedRemainCycle.toLocaleString() : "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{log.location || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{log.userName || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

    </div>
  );
}
