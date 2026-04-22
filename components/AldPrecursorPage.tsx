"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Save, Weight, MapPin, FileText, Loader2, Download, Camera, RefreshCw, Droplet } from "lucide-react";
import BarcodeCameraScanner from "./BarcodeCameraScanner";
import { useT } from "@/lib/i18n";
import { exportCSV } from "@/lib/csvUtils";
import { normalizeBarcodeInput } from "@/lib/barcodeUtils";

interface CanisterInfo {
  id: number;
  barcodeCode: string;
  itemCode: string;
  itemName: string;
  materialName: string;
  status: string;
  tareWeight: number | null;
  initialPureWeight: number | null;
}

interface AldLogItem {
  id: number;
  canisterId: number;
  timestamp: string;
  logSubType: string; // "측정" | "충진"
  grossWeight: number | null;
  pureWeight: number | null;
  cumulativeCycle: number | null;
  cycleDelta: number | null;
  consumptionPerCycle: number | null;
  remainPercent: number | null;
  location: string;
  reason: string;
  userName: string;
}

export default function AldPrecursorPage() {
  const { t } = useT();

  // 검색 관련
  const [barcodeInput, setBarcodeInput] = useState("");
  const isComposingRef = useRef<boolean>(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [searchType, setSearchType] = useState<"바코드" | "품목코드" | "물질명">("바코드");
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Canister / 로그
  const [selectedCanister, setSelectedCanister] = useState<CanisterInfo | null>(null);
  const [logs, setLogs] = useState<AldLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // 측정 입력
  const [logSubType, setLogSubType] = useState<"측정" | "충진">("측정");
  const [grossWeight, setGrossWeight] = useState("");
  const [pureWeight, setPureWeight] = useState("");
  const [cumulativeCycle, setCumulativeCycle] = useState("");
  const [locationId, setLocationId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [weightError, setWeightError] = useState("");

  // UX
  const [toast, setToast] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(
      typeof navigator !== "undefined" &&
        (navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent))
    );
  }, []);

  // Pure Weight 자동 계산
  useEffect(() => {
    const g = parseFloat(grossWeight);
    const tare = selectedCanister?.tareWeight ?? null;
    if (!isNaN(g) && tare != null) {
      setPureWeight((g - tare).toFixed(3));
    } else {
      setPureWeight("");
    }
  }, [grossWeight, selectedCanister?.tareWeight]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleSearch = async () => {
    const q = barcodeInput.trim();
    if (!q) {
      setSearchError("검색어를 입력하세요.");
      barcodeInputRef.current?.focus();
      return;
    }
    setSearchError("");
    setIsSearching(true);
    try {
      // TODO: API 연결
      console.log("[ALD] handleSearch", { searchType, query: q });
    } catch {
      setSearchError(t.ald.saveFailed);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCanister) return;
    if (!grossWeight) return;
    setWeightError("");
    setSaving(true);
    try {
      // TODO: API 연결
      console.log("[ALD] handleSave", {
        canisterId: selectedCanister.id,
        logSubType,
        grossWeight,
        pureWeight,
        cumulativeCycle,
        locationId,
        reason,
      });
      showToast(t.ald.savedOk);
    } catch {
      showToast(t.ald.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleCsvExport = () => {
    if (logs.length === 0) return;
    exportCSV(
      `ald-${selectedCanister?.barcodeCode || "logs"}.csv`,
      logs.map((l) => ({
        시간: l.timestamp,
        구분: l.logSubType,
        Gross: l.grossWeight ?? "",
        Pure: l.pureWeight ?? "",
        누적사이클: l.cumulativeCycle ?? "",
        "소모량(g/cyc)": l.consumptionPerCycle ?? "",
        "잔여량(%)": l.remainPercent ?? "",
        현위치: l.location,
        작성자: l.userName,
      }))
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-6 py-5 border-b border-gray-100 bg-white shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.ald.pageTitle}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{t.ald.subtitle}</p>
          </div>
          {logs.length > 0 && (
            <button
              onClick={handleCsvExport}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200"
            >
              <Download size={16} />
              CSV
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {/* ── 바코드 검색 영역 ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">{t.ald.searchLabel}</label>
          <div className="flex gap-2">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as "바코드" | "품목코드" | "물질명")}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none shrink-0"
            >
              <option value="바코드">{t.ald.searchTypeBarcode}</option>
              <option value="품목코드">{t.ald.searchTypeItemCode}</option>
              <option value="물질명">{t.ald.searchTypeItemName}</option>
            </select>
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={barcodeInputRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(normalizeBarcodeInput(e.target.value))}
                onCompositionStart={() => (isComposingRef.current = true)}
                onCompositionEnd={() => (isComposingRef.current = false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isComposingRef.current) handleSearch();
                }}
                placeholder={t.ald.barcodePlaceholder}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="shrink-0 flex items-center justify-center px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 whitespace-nowrap disabled:opacity-60"
            >
              {isSearching ? <Loader2 size={16} className="animate-spin" /> : t.ald.searchBtn}
            </button>
            {isMobile && (
              <button
                onClick={() => setShowCameraScanner(true)}
                className="shrink-0 px-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200"
              >
                <Camera size={18} />
              </button>
            )}
          </div>
          {searchError && <p className="mt-2 text-sm text-red-500">{searchError}</p>}
        </div>

        {/* ── Canister 정보 + 측정 입력 ── */}
        {selectedCanister && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* 왼쪽: Canister 정보 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900">{t.ald.canisterInfoTitle}</h2>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    selectedCanister.status === "미사용"
                      ? "bg-emerald-100 text-emerald-700"
                      : selectedCanister.status === "사용중"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
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
                    <p className="text-xs text-gray-400 mb-1">{t.ald.itemCodeLabel}</p>
                    <p className="text-sm text-gray-700 truncate">{selectedCanister.itemCode || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">{t.ald.materialLabel}</p>
                    <p className="text-sm text-gray-700">{selectedCanister.materialName || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">{t.ald.tareWeightLabel}</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {selectedCanister.tareWeight != null ? `${selectedCanister.tareWeight.toFixed(3)} g` : "-"}
                    </p>
                  </div>
                </div>
                {logs.length > 0 && logs[0].remainPercent != null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-400">{t.ald.colRemain}</p>
                      <p className="text-sm font-bold text-gray-900">{logs[0].remainPercent.toFixed(1)}%</p>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all ${
                          logs[0].remainPercent > 30
                            ? "bg-emerald-500"
                            : logs[0].remainPercent > 10
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(logs[0].remainPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 오른쪽: 측정 입력 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">{t.ald.subTypeLabel}</p>
                  <div className="flex gap-2">
                    {(["측정", "충진"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setLogSubType(type)}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                          logSubType === type
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {type === "측정" ? t.ald.subTypeMeasure : t.ald.subTypeFill}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    <span className="inline-flex items-center gap-1">
                      <Weight size={12} />
                      {t.ald.grossWeightLabel}
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={grossWeight}
                    onChange={(e) => setGrossWeight(e.target.value)}
                    placeholder="0.000"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t.ald.tareWeightInputLabel}</label>
                  <input
                    type="text"
                    readOnly
                    value={selectedCanister.tareWeight != null ? selectedCanister.tareWeight.toFixed(3) : ""}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    <span className="inline-flex items-center gap-1.5">
                      {t.ald.pureWeightLabel}
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-medium">
                        {t.ald.pureWeightAuto}
                      </span>
                    </span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={pureWeight}
                    className="w-full px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-sm font-semibold text-blue-800"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw size={12} />
                      {t.ald.cycleLabel}
                    </span>
                  </label>
                  <input
                    type="number"
                    value={cumulativeCycle}
                    onChange={(e) => setCumulativeCycle(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} />
                      {t.ald.locationLabel}
                    </span>
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(Number(e.target.value) || "")}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none"
                  >
                    <option value="">선택</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    <span className="inline-flex items-center gap-1">
                      <FileText size={12} />
                      {t.ald.reasonLabel}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t.ald.reasonPlaceholder}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {weightError && <p className="text-xs text-red-500 flex items-center gap-1">{weightError}</p>}
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !grossWeight}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60"
              >
                <Save size={16} />
                {saving ? <Loader2 size={16} className="animate-spin" /> : t.ald.saveBtn}
              </button>
            </div>
          </div>
        )}

        {/* ── 측정 기록 테이블 ── */}
        {selectedCanister && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-900">{t.ald.recordTitle}</h2>
                <span className="text-xs text-gray-400">{total}건</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-40"
                >
                  이전
                </button>
                <span className="text-xs text-gray-500 px-2">{page}</span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                >
                  다음
                </button>
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
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{t.ald.colTime}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{t.ald.colSubType}</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{t.ald.colGross}</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{t.ald.colPure}</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{t.ald.colCycle}</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{t.ald.colConsumption}</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{t.ald.colRemain}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{t.ald.colLocation}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{t.ald.colAuthor}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                          {t.ald.noLogs}
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{log.timestamp}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                log.logSubType === "충진"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {log.logSubType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono whitespace-nowrap">
                            {log.grossWeight != null ? `${log.grossWeight.toFixed(3)}` : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right font-mono whitespace-nowrap">
                            {log.pureWeight != null ? `${log.pureWeight.toFixed(3)}` : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-right whitespace-nowrap">
                            {log.cumulativeCycle ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-right font-mono whitespace-nowrap">
                            {log.consumptionPerCycle != null ? log.consumptionPerCycle.toFixed(4) : "-"}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {log.remainPercent != null ? (
                              <span
                                className={`text-sm font-semibold ${
                                  log.remainPercent > 30
                                    ? "text-emerald-600"
                                    : log.remainPercent > 10
                                    ? "text-amber-600"
                                    : "text-red-600"
                                }`}
                              >
                                {log.remainPercent.toFixed(1)}%
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{log.location || "-"}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{log.userName || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Canister 미선택 상태 안내 */}
        {!selectedCanister && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Droplet size={40} className="mb-3 text-gray-200" />
            <p className="text-sm">{t.ald.noCanister}</p>
          </div>
        )}
      </div>

      {/* 카메라 스캐너 */}
      {showCameraScanner && (
        <BarcodeCameraScanner
          onDetected={(code) => {
            setBarcodeInput(code);
            setShowCameraScanner(false);
          }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
