"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search, Save, Weight, MapPin, FileText, Loader2,
  Camera, Download, RefreshCw, Droplet, Plus, X, QrCode, Pencil,
} from "lucide-react";
import BarcodeCameraScanner from "./BarcodeCameraScanner";
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
  const [portSearchQuery, setPortSearchQuery] = useState("");
  const portSearchRef = useRef<HTMLInputElement>(null);
  const [portSearchResults, setPortSearchResults] = useState<CanisterInfo[]>([]);
  const [portSelectedCanister, setPortSelectedCanister] = useState<CanisterInfo | null>(null);
  const [portSearchLoading, setPortSearchLoading] = useState(false);
  const [portSaving, setPortSaving] = useState(false);

  // ─── Canister 생성 ───
  const [showCreate, setShowCreate] = useState(false);
  const [createMaterialName, setCreateMaterialName] = useState("");
  const [createTareWeight, setCreateTareWeight] = useState("");
  const [createInitialGross, setCreateInitialGross] = useState("");
  const [createMemo, setCreateMemo] = useState("");
  const [creating, setCreating] = useState(false);

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
  const [loading, setLoading] = useState(false);

  // ─── 측정 입력 ───
  const [logSubType, setLogSubType] = useState<"측정" | "충진">("측정");
  const [grossWeight, setGrossWeight] = useState("");
  const [measureWeight, setMeasureWeight] = useState("");
  const [cumulativeCycle, setCumulativeCycle] = useState("");
  const [locationId, setLocationId] = useState<number | "">("");
  const [locationOptions, setLocationOptions] = useState<{ id: number; name: string }[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [weightError, setWeightError] = useState("");

  // ─── UX ───
  const [toast, setToast] = useState("");
  const [isMobile, setIsMobile] = useState(false);

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

  useEffect(() => { fetchPortSlots(); }, []);

  useEffect(() => {
    fetch("/api/locations")
      .then(r => r.ok ? r.json() : [])
      .then(data => setLocationOptions(data))
      .catch(() => {});
  }, []);

  // Measure Weight 자동 계산
  useEffect(() => {
    const g = parseFloat(grossWeight);
    const tare = selectedCanister?.tareWeight ?? null;
    if (!isNaN(g) && tare != null) {
      const m = g - tare;
      setMeasureWeight(m >= 0 ? m.toFixed(3) : "");
    } else {
      setMeasureWeight("");
    }
  }, [grossWeight, selectedCanister?.tareWeight]);

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
      setGrossWeight(""); setMeasureWeight(""); setCumulativeCycle("");
      setReason(""); setLocationId(""); setWeightError("");
      // 로그 조회
      await fetchLogs(1, canister.id);
    } catch { setSearchError("조회 중 오류가 발생했습니다."); }
    finally { setIsSearching(false); }
  };

  const fetchLogs = async (p: number, cId?: number) => {
    const id = cId ?? selectedCanister?.id;
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ald/logs?canisterId=${id}&page=${p}&limit=${PAGE_LIMIT}`);
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setPage(p);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (selectedCanister) fetchLogs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSave = async () => {
    if (!selectedCanister || !grossWeight) return;
    setWeightError("");
    setSaving(true);
    try {
      const res = await fetch("/api/ald/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canisterId:      selectedCanister.id,
          logSubType:      logSubType,
          materialName:    selectedCanister.materialName,
          grossWeight:     parseFloat(grossWeight),
          locationId:      locationId || null,
          cumulativeCycle: cumulativeCycle ? parseInt(cumulativeCycle) : null,
          reason,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setWeightError(e.error || t.ald.saveFailed);
        return;
      }
      showToast(t.ald.savedOk);
      setGrossWeight(""); setMeasureWeight(""); setCumulativeCycle("");
      setReason(""); setLocationId(""); setWeightError("");
      await fetchLogs(1);
      // 충진이면 Canister 정보 새로고침
      if (logSubType === "충진") {
        const r = await fetch(`/api/ald?barcode=${selectedCanister.barcodeCode}`);
        if (r.ok) setSelectedCanister(await r.json());
      }
    } catch { showToast(t.ald.saveFailed); }
    finally { setSaving(false); }
  };

  const handleCreate = async () => {
    if (!createTareWeight) return;
    setCreating(true);
    try {
      const res = await fetch("/api/ald", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialName:       createMaterialName || null,
          tareWeight:         parseFloat(createTareWeight),
          initialGrossWeight: createInitialGross ? parseFloat(createInitialGross) : null,
          memo:               createMemo || null,
        }),
      });
      if (!res.ok) { const e = await res.json(); showToast(e.error || t.ald.createFailed); return; }
      const created = await res.json();
      showToast(`${created.barcodeCode} ${t.ald.createSuccess}`);
      setCreateMaterialName(""); setCreateTareWeight("");
      setCreateInitialGross(""); setCreateMemo("");
      setShowCreate(false);
    } catch { showToast(t.ald.createFailed); }
    finally { setCreating(false); }
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

  // 포트 Canister 검색
  const handlePortSearch = async (query: string) => {
    if (!query.trim()) { setPortSearchResults([]); return; }
    setPortSearchLoading(true);
    try {
      const res = await fetch(
        `/api/ald?search=${encodeURIComponent(query)}&type=바코드`
      );
      if (!res.ok) { setPortSearchResults([]); return; }
      const data = await res.json();
      setPortSearchResults(Array.isArray(data) ? data : [data]);
    } catch { setPortSearchResults([]); }
    finally { setPortSearchLoading(false); }
  };

  const handleCsvExport = () => {
    if (logs.length === 0) return;
    exportCSV(
      ["시간","구분","물질명","Canister","Gross(g)","Tare(g)","Measure(g)","누적사이클","소모량(g/cyc)","잔여량(%)","추정잔여(cyc)","현위치","작성자"],
      logs.map((l) => [
        l.timestamp, l.logSubType, l.materialName, selectedCanister?.barcodeCode ?? "",
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
          onDetected={(code) => { setBarcodeInput(code); setShowCameraScanner(false); }}
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

            {/* 검색 */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={portSearchRef}
                    type="text"
                    value={portSearchQuery}
                    onChange={(e) => {
                      setPortSearchQuery(e.target.value.toUpperCase());
                      handlePortSearch(e.target.value);
                    }}
                    placeholder={t.ald.portSearchPlaceholder}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {portSearchLoading && (
                    <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />
                  )}
                </div>
              </div>

              {/* 검색 결과 */}
              {portSearchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-1">
                  {portSearchResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setPortSelectedCanister(c);
                        setPortSearchQuery("");
                        setPortSearchResults([]);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <p className="text-sm font-semibold text-gray-900">{c.barcodeCode}</p>
                      <p className="text-xs text-gray-500">{c.materialName || c.itemName}</p>
                    </button>
                  ))}
                </div>
              )}
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
        {logs.length > 0 && (
          <button onClick={handleCsvExport}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
            <Download size={15} /> CSV
          </button>
        )}
      </div>

      {/* ── 대시보드 ── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          {t.ald.dashboardTitle}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderEquipmentCard("NCD ALD", "bg-blue-500", ncdPorts, (slot) => {
            setEditingPort(slot);
            setPortSelectedCanister(
              slot.canisterId ? { id: slot.canisterId, barcodeCode: slot.canisterCode ?? "", itemCode: "", itemName: "", materialName: slot.materialName ?? "", status: "사용중", tareWeight: null, initialGrossWeight: null } : null
            );
            setPortSearchQuery("");
            setPortSearchResults([]);
          })}
          {renderEquipmentCard("Rayvac ALD", "bg-purple-500", rayvacPorts, (slot) => {
            setEditingPort(slot);
            setPortSelectedCanister(
              slot.canisterId ? { id: slot.canisterId, barcodeCode: slot.canisterCode ?? "", itemCode: "", itemName: "", materialName: slot.materialName ?? "", status: "사용중", tareWeight: null, initialGrossWeight: null } : null
            );
            setPortSearchQuery("");
            setPortSearchResults([]);
          })}
        </div>
      </div>

      {/* ── 새 Canister 등록 ── */}
      <div>
        <button onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors">
          <Plus size={16} />
          {t.ald.createBtn}
        </button>

        {showCreate && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-blue-900">{t.ald.createTitle}</h2>
              <button onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg hover:bg-blue-100 text-blue-400">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">{t.ald.materialNameLabel}</label>
                <input type="text" value={createMaterialName} onChange={(e) => setCreateMaterialName(e.target.value)}
                  placeholder={t.ald.materialPlaceholder}
                  className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">{t.ald.tareWeightLabel}</label>
                <input type="number" step="0.001" value={createTareWeight} onChange={(e) => setCreateTareWeight(e.target.value)}
                  placeholder="0.000"
                  className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">
                  {t.ald.initialGrossLabel}
                  <span className="ml-1 text-blue-400 font-normal">({t.ald.initialGrossHint})</span>
                </label>
                <input type="number" step="0.001" value={createInitialGross} onChange={(e) => setCreateInitialGross(e.target.value)}
                  placeholder="0.000"
                  className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">{t.ald.memoLabel}</label>
                <input type="text" value={createMemo} onChange={(e) => setCreateMemo(e.target.value)}
                  className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
                취소
              </button>
              <button onClick={handleCreate} disabled={creating || !createTareWeight}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                <QrCode size={16} />
                {creating ? t.ald.creating : t.ald.createSaveBtn}
              </button>
            </div>
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
                  <p className="text-sm font-mono font-semibold text-gray-900">{selectedCanister.barcodeCode}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">{t.ald.materialLabel}</p>
                  <p className="text-sm font-semibold text-gray-900">{selectedCanister.materialName || "-"}</p>
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
              <div>
                <p className="text-xs text-gray-400 mb-1.5">{t.ald.subTypeLabel}</p>
                <div className="flex gap-2">
                  {(["측정", "충진"] as const).map((type) => (
                    <button key={type} onClick={() => setLogSubType(type)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                        logSubType === type ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {type === "측정" ? t.ald.subTypeMeasure : t.ald.subTypeFill}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  <span className="inline-flex items-center gap-1"><Weight size={12} /> {t.ald.grossWeightLabel}</span>
                </label>
                <input type="number" step="0.001" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)}
                  placeholder="0.000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t.ald.tareWeightInputLabel}</label>
                <input type="text" readOnly
                  value={selectedCanister.tareWeight != null ? selectedCanister.tareWeight.toFixed(3) : ""}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  <span className="inline-flex items-center gap-1.5">
                    {t.ald.measureWeightLabel}
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-medium">
                      {t.ald.measureWeightAuto}
                    </span>
                  </span>
                </label>
                <input type="text" readOnly value={measureWeight}
                  className="w-full px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-sm font-semibold text-blue-800" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  <span className="inline-flex items-center gap-1"><RefreshCw size={12} /> {t.ald.cycleLabel}</span>
                </label>
                <input type="number" value={cumulativeCycle} onChange={(e) => setCumulativeCycle(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  <span className="inline-flex items-center gap-1"><MapPin size={12} /> {t.ald.locationLabel}</span>
                </label>
                <select value={locationId} onChange={(e) => setLocationId(Number(e.target.value) || "")}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none">
                  <option value="">선택</option>
                  {locationOptions.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
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
            <button onClick={handleSave} disabled={saving || !grossWeight}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
              <Save size={16} />
              {saving ? <Loader2 size={16} className="animate-spin" /> : t.ald.saveBtn}
            </button>
          </div>
        </div>
      )}

      {/* ── 이력 테이블 ── */}
      {selectedCanister && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900">{t.ald.recordTitle}</h2>
              <span className="text-xs text-gray-400">{total}건</span>
            </div>
            <div className="flex items-center gap-2">
              {logs.length > 0 && (
                <button onClick={handleCsvExport}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50">
                  <Download size={14} /> CSV
                </button>
              )}
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
                    {[t.ald.colTime, t.ald.colSubType, t.ald.colMaterial, t.ald.colCanister].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                    {[t.ald.colGross, t.ald.colTare, t.ald.colMeasure, t.ald.colCycle, t.ald.colConsumption, t.ald.colRemain, t.ald.colEstimatedCycle].map((h) => (
                      <th key={h} className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                    {[t.ald.colLocation, t.ald.colAuthor].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={13} className="px-5 py-12 text-center text-sm text-gray-400">{t.ald.noLogs}</td></tr>
                  ) : logs.map((log) => (
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
      )}

      {/* ── 미선택 안내 ── */}
      {!selectedCanister && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Droplet size={40} className="mb-3 text-gray-200" />
          <p className="text-sm">{t.ald.noCanister}</p>
        </div>
      )}
    </div>
  );
}
