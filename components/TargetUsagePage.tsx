"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Save, AlertTriangle, Weight, MapPin, FileText, ArrowDown, ArrowUp, ArrowUpDown, Loader2, Camera, Download } from "lucide-react";
import { TARGET_STATUS_LABELS, formatWeight } from "@/lib/data";
import BarcodeCameraScanner from "./BarcodeCameraScanner";
import { useT } from "@/lib/i18n";
import { exportCSV } from "@/lib/csvUtils";
import { normalizeBarcodeInput } from "@/lib/barcodeUtils";

interface TargetInfo { id: number; barcodeCode: string; itemCode: string; itemName: string; materialName: string; status: string; memo: string; }
interface LogItem { id: number; targetId: number; timestamp: string; type: string; weight: number | null; location: string; locationId: number | null; reason: string; userName: string; barcodeCode: string; itemName: string; }

interface LocationOption { id: number; name: string; }

interface TargetListItem {
  id: number;
  barcodeCode: string;
  itemCode: string;
  itemName: string;
  materialName: string;
  status: string;
}

interface TargetSearchResult {
  id: number;
  barcodeCode: string;
  itemName: string;
  itemCode: string;
  materialCode: string;
  status: string;
}

interface ChamberSlot {
  id: number;
  locationId: number;
  locationName: string;
  targetUnitId: number | null;
  barcodeCode: string | null;
  itemName: string | null;
  itemCode: string | null;
  materialCode: string | null;
  latestWeight: number | null;
  latestLoggedAt: string | null;
  loadedAt: string | null;
  updatedBy: string | null;
  note: string | null;
}

const PAGE_LIMIT = 50;

export default function TargetUsagePage() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(typeof navigator !== "undefined" && (navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent)));
  }, []);
  const { t } = useT();
  const SEARCH_TYPE_MAP: Record<string, string> = {
    "바코드":  t.target.searchTypeBarcode,
    "품목코드": t.target.searchTypeItemCode,
    "품목명":  t.target.searchTypeItemName,
  };
  const [searchType, setSearchType]         = useState<"바코드" | "품목코드" | "품목명">("바코드");
  const [targetList, setTargetList]         = useState<TargetListItem[]>([]);
  const [barcodeInput, setBarcodeInput]     = useState("");
  const barcodeInputRef                     = useRef<HTMLInputElement>(null);
  const isComposingRef                      = useRef(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<TargetInfo | null>(null);
  const [logs, setLogs]                     = useState<LogItem[]>([]);
  const [total, setTotal]                   = useState(0);

  const handleExportCSV = () => {
    if (!logs || logs.length === 0) return;
    exportCSV(
      ["타임스탬프", "구분", "무게(g)", "품목명", "바코드", "위치", "사유", "작업자"],
      logs.map((log: any) => [
        log.timestamp, log.type, log.weight ?? "",
        log.itemName, log.barcodeCode, log.location,
        log.reason, log.userName,
      ]),
      selectedTarget
        ? `타겟사용현황_${selectedTarget.barcodeCode}_${new Date().toISOString().split("T")[0]}.csv`
        : `타겟사용현황_전체_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const [page, setPage]                     = useState(1);
  const [loading, setLoading]               = useState(true);
  const [weight, setWeight]                 = useState("");
  const [locationId, setLocationId]         = useState<number | "">("");
  const [reason, setReason]                 = useState("");
  const [sortField, setSortField]           = useState("timestamp");
  const [sortDir, setSortDir]               = useState<"asc" | "desc">("desc");
  const [saving, setSaving]                 = useState(false);
  const [disposeConfirm, setDisposeConfirm] = useState(false);
  const [toast, setToast]                   = useState("");
  const [searchError, setSearchError]       = useState("");
  const [isSearching, setIsSearching]       = useState(false);
  const [weightError, setWeightError]       = useState("");
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [chamberSlots, setChamberSlots]     = useState<ChamberSlot[]>([]);
  const [showChamberStatus, setShowChamberStatus] = useState(false);
  const [editingSlot, setEditingSlot]       = useState<ChamberSlot | null>(null);
  const [slotSearchType, setSlotSearchType] = useState<"바코드" | "품목코드" | "품목명">("바코드");
  const [slotSearchQuery, setSlotSearchQuery] = useState("");
  const [slotSearchResults, setSlotSearchResults] = useState<TargetSearchResult[]>([]);
  const [slotSelectedTarget, setSlotSelectedTarget] = useState<TargetSearchResult | null>(null);
  const [slotSearchLoading, setSlotSearchLoading] = useState(false);
  const [showSlotCamera, setShowSlotCamera] = useState(false);
  const [editNote, setEditNote]             = useState("");
  const [slotSaving, setSlotSaving]         = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  // 마운트 시 바코드 input 자동 포커스
  useEffect(() => {
    const timer = setTimeout(() => { barcodeInputRef.current?.focus(); }, 150);
    return () => clearTimeout(timer);
  }, []);

  // 장비 위치 목록 로드 (마운트 시 1회)
  useEffect(() => {
    fetch("/api/locations?type=target")
      .then(r => r.json())
      .then(setLocationOptions)
      .catch(console.error);
  }, []);

  // 챔버 슬롯 로드 (마운트 시 1회)
  useEffect(() => {
    fetch("/api/chamber-slots")
      .then(r => r.json())
      .then(data => Array.isArray(data) && setChamberSlots(data))
      .catch(console.error);
  }, []);

  // 슬롯 수정 모달 타겟 검색 자동 실행
  useEffect(() => {
    if (!slotSearchQuery.trim()) {
      setSlotSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSlotSearchLoading(true);
      try {
        const res = await fetch(
          `/api/chamber-slots?q=${encodeURIComponent(slotSearchQuery)}&type=${encodeURIComponent(slotSearchType)}`
        );
        const data = await res.json();
        setSlotSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setSlotSearchResults([]);
      } finally {
        setSlotSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [slotSearchQuery, slotSearchType]);

  const fetchLogs = async (targetPage: number, barcode?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), limit: String(PAGE_LIMIT) });
      if (barcode) params.set("barcode", barcode);
      const res = await fetch(`/api/targets?${params}`);
      if (!res.ok) {
        const err = await res.json();
        setSearchError(err.error || t.target.searchFailed);
        setSelectedTarget(null);
        return;
      }
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      if (barcode) setSelectedTarget(data.target);
      setSearchError("");
    } catch { setSearchError(t.target.searchError); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(1); }, []);

  const handleSearch = async () => {
    const code = barcodeInput.trim();
    if (!code) {
      setSelectedTarget(null);
      setTargetList([]);
      setSearchError("");
      fetchLogs(1);
      return;
    }

    setIsSearching(true);
    setTargetList([]);
    setSelectedTarget(null);

    try {
      if (searchType === "바코드") {
        await fetchLogs(1, code);
      } else {
        const params = new URLSearchParams();
        if (searchType === "품목코드") params.set("itemCode", code);
        if (searchType === "품목명")   params.set("itemName", code);
        const res = await fetch(`/api/targets?${params}`);
        const data = await res.json();
        if (!data.targetList?.length) {
          setSearchError(t.target.noResults);
        } else {
          setTargetList(data.targetList);
          setSearchError("");
        }
      }
    } finally {
      setIsSearching(false);
    }
  };

  // 무게 측정값 저장
  const handleSaveWeight = async () => {
    if (!selectedTarget) return;

    // 위치 분류 상수
    const STORAGE_IDS = [3, 4];
    const CHAMBER_IDS = [5, 6, 7, 8, 9, 10];

    const prevLocationId = logs.length > 0 ? (logs[0].locationId ?? null) : null;
    const currLocationId = locationId !== "" ? Number(locationId) : null;

    // 보관함 → Chamber 이동 시만 무게 선택 가능, 나머지는 무게 필수
    const isStorageToChamber =
      prevLocationId !== null &&
      currLocationId !== null &&
      STORAGE_IDS.includes(prevLocationId) &&
      CHAMBER_IDS.includes(currLocationId);

    const weightRequired = !isStorageToChamber;

    if (weightRequired && !weight) {
      showToast(t.target.enterWeight);
      return;
    }

    const latestLog = logs.length > 0 ? logs[0] : null;
    const latestWeight = latestLog?.weight != null ? Number(latestLog.weight) : null;
    const newWeight = weight ? Number(weight) : null;

    if (newWeight !== null && latestWeight !== null && newWeight > latestWeight) {
      setWeightError(t.target.weightTooHigh);
      return;
    }
    setWeightError("");
    setSaving(true);
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUnitId: selectedTarget.id, type: "측정", weight: weight ? parseFloat(weight) : null, locationId: locationId || null, reason }),
      });
      if (!res.ok) { const e = await res.json(); showToast(e.error || t.common.saveFail); return; }
      showToast(t.target.weightSaved);
      setWeight(""); setLocationId(""); setReason("");
      fetchLogs(1, selectedTarget.barcodeCode);
    } catch { showToast(t.target.saveFailed); }
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
      if (!res.ok) { const e = await res.json(); showToast(e.error || t.common.saveFail); return; }
      showToast(t.target.infoSaved);
    } catch { showToast(t.target.saveFailed); }
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
      if (!res.ok) { const e = await res.json(); showToast(e.error || t.target.disposeFailed); return; }
      // 폐기 로그도 함께 기록
      await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUnitId: selectedTarget.id, type: "폐기", weight: weight ? parseFloat(weight) : null, locationId: locationId || null, reason: reason || "수명 종료 폐기" }),
      });
      setDisposeConfirm(false);
      fetchLogs(1, selectedTarget.barcodeCode);
    } catch { showToast(t.target.processFailed); }
    finally { setSaving(false); }
  };

  // 챔버 슬롯 수정 핸들러
  const handleSlotSave = async () => {
    if (!editingSlot) return;
    setSlotSaving(true);
    try {
      const res = await fetch("/api/chamber-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingSlot.id,
          targetUnitId: slotSelectedTarget?.id ?? null,
          note: editNote || null,
        }),
      });
      if (!res.ok) { showToast(t.common.saveFail); return; }
      const updated = await fetch("/api/chamber-slots").then(r => r.json());
      setChamberSlots(Array.isArray(updated) ? updated : []);
      setEditingSlot(null);
      showToast(t.target.slotSaved);
    } catch {
      showToast(t.target.slotError);
    } finally {
      setSlotSaving(false);
    }
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
      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* 챔버 슬롯 수정 모달 */}
      {editingSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setEditingSlot(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{editingSlot.locationName} 수정</h3>
              <button
                onClick={() => setEditingSlot(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-sm"
              >✕</button>
            </div>

            <div className="space-y-3">
              {/* 현재 장착 타겟 표시 */}
              <div className="px-3 py-2 bg-gray-50 rounded-xl text-sm">
                <span className="text-xs text-gray-400">{t.target.currentLabel}: </span>
                <span className="font-semibold text-gray-800">
                  {slotSelectedTarget
                    ? `${slotSelectedTarget.barcodeCode} · ${slotSelectedTarget.itemName}`
                    : t.target.empty}
                </span>
              </div>

              {/* 검색 타입 + 입력 */}
              <div className="flex gap-2">
                <select
                  value={slotSearchType}
                  onChange={e => {
                    setSlotSearchType(e.target.value as "바코드" | "품목코드" | "품목명");
                    setSlotSearchQuery("");
                    setSlotSearchResults([]);
                  }}
                  className="px-2 py-2 border border-gray-200 rounded-xl text-xs bg-white outline-none shrink-0"
                >
                  <option value="바코드">{t.target.searchTypeBarcode}</option>
                  <option value="품목코드">{t.target.searchTypeItemCode}</option>
                  <option value="품목명">{t.target.searchTypeItemName}</option>
                </select>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={slotSearchQuery}
                    onChange={e => setSlotSearchQuery(
                      slotSearchType === "바코드"
                        ? e.target.value.toUpperCase()
                        : e.target.value
                    )}
                    placeholder={
                      slotSearchType === "바코드"   ? t.target.slotBarcodePlaceholder :
                      slotSearchType === "품목코드" ? t.target.slotItemCodePlaceholder : t.target.slotItemNamePlaceholder
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                  />
                  {slotSearchLoading && (
                    <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />
                  )}
                </div>
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setShowSlotCamera(true)}
                    className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"
                  >
                    <Camera size={16} />
                  </button>
                )}
              </div>

              {/* 검색 결과 목록 */}
              {slotSearchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-1">
                  {slotSearchResults.map(tu => (
                    <button
                      key={tu.id}
                      onClick={() => {
                        setSlotSelectedTarget(tu);
                        setSlotSearchQuery("");
                        setSlotSearchResults([]);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <p className="text-sm font-semibold text-gray-900">{tu.barcodeCode}</p>
                      <p className="text-xs text-gray-500">{tu.itemName}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* 메모 */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t.target.memoLabel}</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder={t.target.memoPlaceholder}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSlotSelectedTarget(null);
                  setSlotSearchQuery("");
                }}
                className="px-3 py-2.5 border border-rose-200 text-rose-500 rounded-xl text-sm hover:bg-rose-50"
              >{t.target.clearSlot}</button>
              <button
                onClick={() => setEditingSlot(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >{t.common.cancel}</button>
              <button
                onClick={handleSlotSave}
                disabled={slotSaving}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60"
              >{slotSaving ? t.common.saving : t.common.save}</button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t.nav.target}</h1>
        <p className="text-sm text-gray-500 mt-1">{t.target.subtitle}</p>
      </div>

      {/* 챔버별 타겟 현황 */}
      {chamberSlots.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowChamberStatus(v => !v)}
            className="flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
          >
            <span>{t.target.chamberTitle}</span>
            <span className="text-xs text-gray-400 font-normal">
              ({chamberSlots.filter(s => s.targetUnitId).length}/{chamberSlots.length})
            </span>
            <span className={`text-xs text-gray-400 transition-transform inline-block ${showChamberStatus ? "rotate-180" : ""}`}>▼</span>
          </button>
          {showChamberStatus && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {chamberSlots.map(slot => (
              <div
                key={slot.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-700">{slot.locationName}</p>
                  <button
                    onClick={() => {
                      setEditingSlot(slot);
                      setSlotSearchQuery("");
                      setSlotSearchResults([]);
                      setSlotSelectedTarget(
                        slot.targetUnitId
                          ? {
                              id: slot.targetUnitId,
                              barcodeCode: slot.barcodeCode ?? "",
                              itemName: slot.itemName ?? "",
                              itemCode: slot.itemCode ?? "",
                              materialCode: slot.materialCode ?? "",
                              status: "using",
                            }
                          : null
                      );
                      setEditNote(slot.note ?? "");
                    }}
                    className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                  >
                    {t.common.edit}
                  </button>
                </div>
                {slot.targetUnitId ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {slot.barcodeCode}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{slot.itemName}</p>
                      {slot.materialCode && (
                        <p className="text-xs text-gray-400">{slot.materialCode}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-gray-50">
                      <div>
                        <p className="text-xs text-gray-400">{t.target.currentWeight}</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {slot.latestWeight != null
                            ? `${slot.latestWeight.toFixed(3)}g`
                            : "-"}
                        </p>
                      </div>
                      {slot.latestLoggedAt && (
                        <p className="text-xs text-gray-400">
                          {new Date(slot.latestLoggedAt).toLocaleDateString("ko-KR")}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 py-2 text-center">{t.target.empty}</p>
                )}
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* 바코드 조회 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
        <label className="block text-sm font-semibold text-gray-700 mb-2">{t.target.searchLabel}</label>
        <div className="flex gap-2">
          <select
            value={searchType}
            onChange={e => {
              setSearchType(e.target.value as "바코드" | "품목코드" | "품목명");
              setBarcodeInput("");
              setTargetList([]);
              setSelectedTarget(null);
              setSearchError("");
            }}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
          >
            <option value="바코드">{t.target.searchTypeBarcode}</option>
            <option value="품목코드">{t.target.searchTypeItemCode}</option>
            <option value="품목명">{t.target.searchTypeItemName}</option>
          </select>
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder={
                searchType === "바코드"   ? t.target.barcodePlaceholder :
                searchType === "품목코드" ? t.target.itemCodePlaceholder :
                t.target.itemNamePlaceholder
              }
              value={barcodeInput}
              onChange={e => {
                if ((e.nativeEvent as any).isComposing) return;
                const val = searchType === "바코드"
                  ? normalizeBarcodeInput(e.target.value)
                  : e.target.value;
                setBarcodeInput(val);
                setSearchError("");
              }}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={e => {
                isComposingRef.current = false;
                setBarcodeInput(
                  searchType === "바코드"
                    ? normalizeBarcodeInput(e.currentTarget.value)
                    : e.currentTarget.value
                );
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && !isComposingRef.current) {
                  const code = e.currentTarget.value.trim();
                  if (code) handleSearch();
                  else { setSelectedTarget(null); setTargetList([]); setSearchError(""); fetchLogs(1); }
                }
              }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {isSearching && (
              <div className="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none">
                <Loader2 size={14} className="animate-spin text-blue-500" />
              </div>
            )}
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={() => setShowCameraScanner(true)}
              className="p-2 rounded border border-gray-300 hover:bg-gray-100"
              title="카메라로 스캔"
            >
              <Camera size={18} />
            </button>
          )}
          <button onClick={handleSearch} className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600">{t.target.searchBtn}</button>
        </div>
        {searchError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{searchError}</p>}

        {targetList.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500 font-medium">
              {t.target.searchResult(targetList.length)}
            </p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {targetList.map(tu => (
                <button
                  key={tu.id}
                  onClick={() => {
                    setBarcodeInput(tu.barcodeCode);
                    setSearchType("바코드");
                    setTargetList([]);
                    fetchLogs(1, tu.barcodeCode);
                  }}
                  className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 border border-gray-200 rounded-xl transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{tu.itemName}</p>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">
                        {tu.barcodeCode} · {tu.itemCode}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      tu.status === "available" ? "bg-emerald-100 text-emerald-700" :
                      tu.status === "using"     ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {tu.status === "available" ? t.target.statusAvailable :
                       tu.status === "using"     ? t.target.statusUsing : t.target.statusDisposed}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 타겟 정보 + 측정 입력 */}
      {selectedTarget && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">

          {/* 왼쪽: 타겟 정보 카드 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">{t.target.infoTitle}</h2>
              {statusInfo && <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>}
            </div>

            {/* 정보 필드 — flex-1로 남은 공간 채움 */}
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-gray-400 mb-1">{t.target.targetIdLabel}</p><p className="text-sm font-semibold text-gray-900">{selectedTarget.id}</p></div>
                <div><p className="text-xs text-gray-400 mb-1">{t.target.barcodeLabel}</p><p className="text-sm font-mono font-semibold text-gray-900 truncate">{selectedTarget.barcodeCode}</p></div>
                <div><p className="text-xs text-gray-400 mb-1">{t.target.itemCodeLabel}</p><p className="text-sm text-gray-700 truncate">{selectedTarget.itemCode || "-"}</p></div>
                <div><p className="text-xs text-gray-400 mb-1">{t.target.itemNameLabel}</p><p className="text-sm text-gray-700 truncate">{selectedTarget.itemName || "-"}</p></div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">{t.target.materialNameLabel}</p>
                <input type="text" value={selectedTarget.materialName}
                  onChange={e => setSelectedTarget({ ...selectedTarget, materialName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>

            {/* 버튼 — mt-auto로 하단 고정 */}
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <button onClick={handleSaveInfo} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
                  <Save size={16} />{saving ? t.common.saving : t.target.saveInfo}
                </button>
                {selectedTarget.status !== "disposed" && (
                  <button onClick={handleDispose} disabled={saving}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 transition-all ${
                      disposeConfirm
                        ? "bg-rose-600 text-white hover:bg-rose-700 animate-pulse"
                        : "bg-rose-500 text-white hover:bg-rose-600"
                    }`}>
                    <AlertTriangle size={16} />{disposeConfirm ? t.target.disposeConfirm : t.target.dispose}
                  </button>
                )}
              </div>
              {disposeConfirm && (
                <p className="text-xs text-rose-500 text-center">{t.target.disposeHint} <button onClick={() => setDisposeConfirm(false)} className="underline">{t.common.cancel}</button></p>
              )}
            </div>
          </div>

          {/* 오른쪽: 무게 측정 입력 카드 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
            <h2 className="font-bold text-gray-900 mb-4">{t.target.weightTitle}</h2>

            {/* 입력 필드 — flex-1로 남은 공간 채움 */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1"><span className="inline-flex items-center gap-1"><Weight size={12} />{t.target.weightLabel}</span></label>
                <input type="text" placeholder={(() => {
                    const STORAGE_IDS = [3, 4];
                    const CHAMBER_IDS = [5, 6, 7, 8, 9, 10];
                    const prevLocId = logs.length > 0 ? (logs[0].locationId ?? null) : null;
                    const currLocId = locationId !== "" ? Number(locationId) : null;
                    const isStorageToChamber =
                      prevLocId !== null && currLocId !== null &&
                      STORAGE_IDS.includes(prevLocId) && CHAMBER_IDS.includes(currLocId);
                    return isStorageToChamber ? t.target.weightOptionalPlaceholder : t.target.weightRequiredPlaceholder;
                  })()} value={weight} onChange={(e) => { setWeight(e.target.value); setWeightError(""); }}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                {weightError && (
                  <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {weightError}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1"><span className="inline-flex items-center gap-1"><MapPin size={12} />{t.target.locationLabel}</span></label>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none">
                  <option value="">{t.target.locationPlaceholder}</option>
                  {locationOptions.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1"><span className="inline-flex items-center gap-1"><FileText size={12} />{t.target.reasonLabel}</span></label>
                <input type="text" placeholder={t.target.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* 버튼 — mt-auto로 하단 고정 */}
            <button onClick={handleSaveWeight} disabled={saving}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
              <Save size={16} />{saving ? t.common.saving : t.target.saveWeight}
            </button>
          </div>

        </div>
      )}

      {/* 로그 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{selectedTarget ? t.target.logTitle(selectedTarget.barcodeCode) : t.target.allLogsTitle}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{t.target.totalCount} {total.toLocaleString()}{t.target.countUnit}</span>
            <button onClick={handleExportCSV} disabled={!logs || logs.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Download size={15} />CSV
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("timestamp")}><div className="flex items-center gap-1">{t.target.colTime} <SortIcon field="timestamp" /></div></th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.inventory.colType}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("weight")}><div className="flex items-center justify-end gap-1">{t.target.colWeight} <SortIcon field="weight" /></div></th>
                  {!selectedTarget && <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.inventory.colItem}</th>}
                  {!selectedTarget && <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.target.barcodeLabel}</th>}
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.target.colStorage}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.target.colReason}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.target.colAuthor}</th>
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
                  {sorted.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">{t.target.noLogs}</td></tr>}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {total > PAGE_LIMIT && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {((page - 1) * PAGE_LIMIT + 1).toLocaleString()}–{Math.min(page * PAGE_LIMIT, total).toLocaleString()} / {total.toLocaleString()}{t.target.countUnit}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchLogs(page - 1, selectedTarget?.barcodeCode)}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t.common.prev}
                  </button>
                  <span className="text-xs text-gray-500 min-w-[60px] text-center">
                    {page} / {Math.ceil(total / PAGE_LIMIT)}
                  </span>
                  <button
                    onClick={() => fetchLogs(page + 1, selectedTarget?.barcodeCode)}
                    disabled={page >= Math.ceil(total / PAGE_LIMIT)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t.common.next}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {showCameraScanner && (
        <BarcodeCameraScanner
          onDetected={code => {
            setShowCameraScanner(false);
            setSearchType("바코드");
            setBarcodeInput(code);
            fetchLogs(1, code);
          }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}
      {showSlotCamera && (
        <BarcodeCameraScanner
          onDetected={code => {
            setShowSlotCamera(false);
            setSlotSearchType("바코드");
            setSlotSearchQuery(code.toUpperCase());
          }}
          onClose={() => setShowSlotCamera(false)}
        />
      )}
    </div>
  );
}
