"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, Trash2, Copy, QrCode, Check, X, Loader2, Printer, Pencil, Download } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { normalizeBarcodeInput } from "@/lib/barcodeUtils";
import { exportXLSX } from "@/lib/xlsxUtils";
import BarcodeLabelModal from "@/components/BarcodeLabelModal";

interface BarcodeItem {
  id: number; code: string; itemCode: string; itemName: string;
  category: string; targetUnitId: number | null; isActive: string;
  memo?: string;
}
interface ItemOption { id: number; code: string; name: string; }
interface UnlinkedInbound {
  inventoryTxId: number;
  txNo: string;
  txDate: string;
  qty: number;
  remainQty: number;
  partnerName: string;
  locationName: string;
  unitPrice: number | null;
  currency: string;
  memo: string;
}

const CATS = ["전체", "타겟", "ALD Canister", "웨이퍼", "가스", "기자재/소모품"];

export default function BarcodePage() {
  const { t } = useT();
  const SEARCH_TYPE_LABEL: Record<string, string> = {
    "전체": t.barcode.sfAll, "바코드": t.barcode.sfBarcode,
    "품목코드": t.barcode.sfItemCode, "품목명": t.barcode.sfItemName,
  };
  const CAT_LABEL: Record<string, string> = {
    "전체": t.barcode.catAll, "타겟": t.barcode.catTarget,
    "ALD Canister": t.inventory.catAldCanister,
    "웨이퍼": t.barcode.catWafer, "가스": t.barcode.catGas,
    "기자재/소모품": t.barcode.catEquip,
  };
  const [barcodes, setBarcodes]         = useState<BarcodeItem[]>([]);
  const handleExportCSV = () => {
    if (!barcodes || barcodes.length === 0) return;
    exportXLSX(
      ["ID", "바코드", "품목코드", "품목명", "품목군", "타겟ID", "활성여부", "메모"],
      barcodes.map(b => [
        b.id, b.code, b.itemCode, b.itemName, b.category,
        b.targetUnitId ?? "", b.isActive, b.memo ?? "",
      ]),
      `바코드_${new Date().toISOString().split("T")[0]}.xlsx`,
      "바코드"
    );
  };
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [showCreate, setShowCreate]     = useState(false);

  // 바코드 생성 폼 상태
  const [createCategory, setCreateCategory] = useState("웨이퍼");
  const [createItemId, setCreateItemId]     = useState<number | null>(null);
  const [createItemCode, setCreateItemCode] = useState("");
  const [createItemName, setCreateItemName] = useState("");
  const [createMemo, setCreateMemo]         = useState("")
  const [itemOptions, setItemOptions]       = useState<ItemOption[]>([]);
  const [showItemDrop, setShowItemDrop]     = useState(false);
  const [creating, setCreating]             = useState(false);
  const [createError, setCreateError]       = useState("");
  const [createSuccess, setCreateSuccess]   = useState("");
  const [unlinkedInbounds, setUnlinkedInbounds]       = useState<UnlinkedInbound[]>([]);
  const [selectedInboundTxId, setSelectedInboundTxId] = useState<number | null>(null);
  const [loadingInbounds, setLoadingInbounds]         = useState(false);
  const [toast, setToast]                   = useState("");
  const [printItem, setPrintItem]           = useState<BarcodeItem | null>(null);
  const [editTarget, setEditTarget]         = useState<BarcodeItem | null>(null);
  const [editCode, setEditCode]             = useState("");
  const [editMemo, setEditMemo]             = useState("");
  const [editIsActive, setEditIsActive]     = useState<"Y" | "N">("Y");
  const [editSaving, setEditSaving]         = useState(false);
  const [sortField, setSortField]           = useState<"id" | "code" | "category">("id");
  const [sortDir, setSortDir]               = useState<"asc" | "desc">("desc");
  const [hoveredId, setHoveredId]           = useState<number | null>(null);
  const [searchType, setSearchType]         = useState<"전체" | "바코드" | "품목코드" | "품목명">("전체");
  const itemDropRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) {
        const finalSearch = searchType === '바코드' ? normalizeBarcodeInput(search) : search;
        params.set("search", finalSearch);
        params.set("searchType", searchType);
      }
      if (categoryFilter !== "전체") params.set("category", categoryFilter);
      const res = await fetch(`/api/barcodes?${params}`);
      if (res.ok) setBarcodes(await res.json());
    } catch { setToast(t.barcode.fetchFailed); setTimeout(() => setToast(""), 3000); }
    finally { setLoading(false); }
  }, [search, categoryFilter, searchType]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // 바코드 생성 폼 품목군 바뀔 때 품목 로드
  useEffect(() => {
    fetch(`/api/items?category=${encodeURIComponent(createCategory)}`)
      .then(r => r.json()).then(setItemOptions)
      .catch(() => setCreateError(t.barcode.itemLoadFailed));
    setCreateItemId(null); setCreateItemCode(""); setCreateItemName("");
    setUnlinkedInbounds([]); setSelectedInboundTxId(null);
  }, [createCategory]);

  // 품목 선택 시 바코드 미연결 입고건 로딩
  useEffect(() => {
    if (!createItemId) {
      setUnlinkedInbounds([]);
      setSelectedInboundTxId(null);
      return;
    }
    setLoadingInbounds(true);
    fetch(`/api/inventory/unlinked-inbounds?itemId=${createItemId}`)
      .then(r => r.json())
      .then((list: UnlinkedInbound[]) => {
        setUnlinkedInbounds(Array.isArray(list) ? list : []);
        setSelectedInboundTxId(null);
      })
      .catch(() => setUnlinkedInbounds([]))
      .finally(() => setLoadingInbounds(false));
  }, [createItemId]);

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (itemDropRef.current && !itemDropRef.current.contains(e.target as Node))
        setShowItemDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 바코드 생성 + 입고건 사후 연결
  const handleCreate = async () => {
    if (!createItemId)        { setCreateError(t.barcode.selectItemError); return; }
    if (!selectedInboundTxId) { setCreateError(t.barcode.selectInboundRequired); return; }
    setCreateError(""); setCreating(true);
    try {
      const res = await fetch("/api/barcodes/link-to-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryTxId: selectedInboundTxId,
          memo: createMemo || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || t.barcode.createFailed); return; }

      setCreateSuccess(t.barcode.createLinkedSuccess(data.code, data.linkedTxNo));
      setTimeout(() => setCreateSuccess(""), 4000);
      // 폼 초기화
      setCreateItemId(null); setCreateItemCode(""); setCreateItemName(""); setCreateMemo("");
      setUnlinkedInbounds([]); setSelectedInboundTxId(null);
      fetchData();
    } catch { setCreateError(t.common.networkError); }
    finally { setCreating(false); }
  };

  // 바코드 삭제
  const handleDelete = async (b: BarcodeItem) => {
    if (!confirm(t.barcode.deleteConfirm(b.code))) return;
    try {
      const res = await fetch(`/api/barcodes?id=${b.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t.barcode.deleteFailed); return; }
      fetchData();
    } catch { alert(t.common.networkError); }
  };

  return (
    <div className="space-y-5">
      {/* 바코드 수정 모달 */}
      {editTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{t.barcode.editTitle}</h3>
              <button onClick={() => setEditTarget(null)} className="p-1 rounded hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="text-sm text-gray-500 mb-3">
              {editTarget.itemCode} · {editTarget.itemName}
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.barcode.barcodeCodeLabel}</label>
              <input
                type="text"
                value={editCode}
                onChange={e => setEditCode(e.target.value.toUpperCase())}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.barcode.memoLabel}</label>
              <p className="text-xs text-gray-400 mt-0.5">{t.barcode.memoHint}</p>
              <input
                type="text"
                value={editMemo}
                onChange={e => setEditMemo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.barcode.statusLabel}</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditIsActive("Y")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    editIsActive === "Y" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-300 hover:border-green-400"
                  }`}
                >
                  {t.barcode.activeY}
                </button>
                <button
                  onClick={() => setEditIsActive("N")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    editIsActive === "N" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-300 hover:border-red-400"
                  }`}
                >
                  {t.barcode.inactiveN}
                </button>
              </div>
            </div>
            <button
              onClick={async () => {
                setEditSaving(true);
                try {
                  const res = await fetch("/api/barcodes", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: editTarget.id,
                      code: editCode,
                      memo: editMemo || null,
                      isActive: editIsActive,
                    }),
                  });
                  if (!res.ok) throw new Error(t.common.saveFail);
                  setEditTarget(null);
                  fetchData();
                } catch {
                  alert(t.barcode.editSaveFailed);
                } finally {
                  setEditSaving(false);
                }
              }}
              disabled={editSaving}
              className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {editSaving ? t.common.saving : t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* 프린트 미리보기 모달 */}
      {printItem && (
        <BarcodeLabelModal
          code={printItem.code}
          itemCode={printItem.itemCode}
          itemName={printItem.itemName}
          memo={printItem.memo ?? null}
          onClose={() => setPrintItem(null)}
        />
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.barcode.pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t.barcode.subtitle}</p>
        </div>
        <button onClick={() => {
            if (showCreate) {
              // 닫을 때 폼 전체 리셋
              setCreateItemId(null); setCreateItemCode(""); setCreateItemName(""); setCreateMemo("");
            }
            setShowCreate(!showCreate); setCreateError(""); setCreateSuccess("");
          }}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 shadow-sm">
          <Plus size={16} />{t.barcode.newBarcode}
        </button>
      </div>

      {/* ── 바코드 생성 폼 ── */}
      {showCreate && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-bold text-blue-900">{t.barcode.createTitle}</h2>
          <p className="text-xs text-blue-600">{t.barcode.createNotice}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:gap-3 gap-3">
            {/* 품목군 */}
            <div className="sm:flex-1 sm:min-w-[150px] w-full">
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.barcode.catLabel}</label>
              <select value={createCategory} onChange={e => setCreateCategory(e.target.value)}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none">
                {["웨이퍼", "가스", "기자재/소모품"].map(c => (
                  <option key={c} value={c}>{CAT_LABEL[c] || c}</option>
                ))}
              </select>
            </div>

            {/* 품목코드 + 선택 */}
            <div className="sm:flex-1 sm:min-w-[160px] w-full">
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.barcode.itemCodeLabel}</label>
              <div className="relative" ref={itemDropRef}>
                <div className="flex gap-1">
                  <input value={createItemCode} readOnly placeholder={t.barcode.autoFill}
                    className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-sm" />
                  <button onClick={() => setShowItemDrop(v => !v)}
                    className="shrink-0 px-3 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-semibold hover:bg-blue-600 whitespace-nowrap">
                    {t.barcode.selectBtn}
                  </button>
                </div>
                {showItemDrop && (
                  <div className="absolute left-0 right-0 z-[100] mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {itemOptions.length === 0 ? (
                      <p className="px-3 py-2.5 text-sm text-gray-400">{t.barcode.noItems}</p>
                    ) : itemOptions.map(opt => (
                      <button key={opt.id} onClick={() => {
                        setCreateItemId(opt.id); setCreateItemCode(opt.code); setCreateItemName(opt.name);
                        setShowItemDrop(false);
                      }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0">
                        <span className="font-medium text-gray-900">{opt.name}</span>
                        <span className="ml-2 text-xs text-gray-400 font-mono">{opt.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 품목명 자동 입력 (타겟 외에만 표시) */}
            {createCategory !== "타겟" && (
              <div className="sm:flex-1 sm:min-w-[150px] w-full">
                <label className="block text-xs font-semibold text-blue-700 mb-1">{t.barcode.itemNameLabel}</label>
                <input value={createItemName} readOnly placeholder={t.barcode.autoFill}
                  className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-sm" />
              </div>
            )}

            {/* 연결할 입고건 */}
            <div className="w-full">
              <label className="block text-xs font-semibold text-blue-700 mb-1">
                {t.barcode.inboundSectionLabel}
                <span className="text-rose-500"> *</span>
                {unlinkedInbounds.length > 0 && (
                  <span className="ml-2 text-blue-500">
                    {t.barcode.inboundCountSuffix(unlinkedInbounds.length)}
                  </span>
                )}
              </label>
              {!createItemId ? (
                <div className="px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
                  {t.barcode.inboundEmptyNoItem}
                </div>
              ) : loadingInbounds ? (
                <div className="px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
                  {t.barcode.inboundLoading}
                </div>
              ) : unlinkedInbounds.length === 0 ? (
                <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  {t.barcode.inboundEmpty}
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-blue-200 rounded-xl bg-white divide-y divide-gray-100">
                  {unlinkedInbounds.map(ib => (
                    <label key={ib.inventoryTxId}
                      className={`flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                        selectedInboundTxId === ib.inventoryTxId ? "bg-blue-100" : ""
                      }`}>
                      <input type="radio" name="unlinkedInbound" className="mt-0.5"
                        checked={selectedInboundTxId === ib.inventoryTxId}
                        onChange={() => setSelectedInboundTxId(ib.inventoryTxId)} />
                      <div className="text-xs leading-tight">
                        <div className="font-semibold text-gray-800">
                          {ib.txDate} · 전표 {ib.txNo}
                        </div>
                        <div className="text-gray-600">
                          {ib.partnerName || "-"} · {ib.locationName} · 수량 {ib.qty.toLocaleString()} / 잔여 {ib.remainQty.toLocaleString()}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 메모 (모든 카테고리) */}
            <div className="sm:flex-1 sm:min-w-[160px] w-full">
              <label className="block text-xs font-semibold text-blue-700 mb-1">
                {t.barcode.memoLabel} {createCategory !== "타겟" && <span className="text-blue-400 font-normal">{t.barcode.memoOptional}</span>}
              </label>
              <input type="text" value={createMemo} onChange={e => setCreateMemo(e.target.value)}
                placeholder={createCategory === "타겟" ? t.barcode.memoTargetPlaceholder : t.barcode.memoOtherPlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm outline-none bg-white" />
            </div>

            {/* 버튼 */}
            <div className="flex items-end w-full sm:w-auto">
              <button onClick={handleCreate} disabled={!createItemId || !selectedInboundTxId || creating}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60 whitespace-nowrap">
                <QrCode size={16} />{creating ? t.barcode.creating : t.barcode.createAndLinkSave}
              </button>
            </div>
          </div>

          {createError   && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{createError}</p>}
          {createSuccess && <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl">{createSuccess}</p>}
        </div>
      )}

      {/* ── 검색 필터 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={searchType}
            onChange={e => setSearchType(e.target.value as any)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shrink-0"
          >
            <option value="전체">{t.barcode.sfAll}</option>
            <option value="바코드">{t.barcode.sfBarcode}</option>
            <option value="품목코드">{t.barcode.sfItemCode}</option>
            <option value="품목명">{t.barcode.sfItemName}</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder={t.barcode.searchPlaceholder} value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchData()}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 overflow-x-auto">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${categoryFilter === c ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{CAT_LABEL[c] || c}</button>
            ))}
          </div>
          <button onClick={handleExportCSV} disabled={!barcodes || barcodes.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Download size={15} />Excel
          </button>
        </div>
      </div>

      {/* ── 바코드 목록 ── */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (() => {
        const sortedBarcodes = [...barcodes].sort((a, b) => {
          const dir = sortDir === "asc" ? 1 : -1;
          if (sortField === "id")       return (a.id - b.id) * dir;
          if (sortField === "code")     return a.code.localeCompare(b.code) * dir;
          if (sortField === "category") return a.category.localeCompare(b.category) * dir;
          return 0;
        });

        const handleSort = (field: "id" | "code" | "category") => {
          if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
          else { setSortField(field); setSortDir("desc"); }
        };

        const SortIcon = ({ field }: { field: string }) => {
          if (sortField !== field) return <span className="text-gray-300">↕</span>;
          return sortDir === "asc" ? <span className="text-blue-500">↑</span> : <span className="text-blue-500">↓</span>;
        };

        return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* 데스크탑 테이블 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("id")}>
                  <div className="flex items-center gap-1">ID <SortIcon field="id" /></div>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("code")}>
                  <div className="flex items-center gap-1">{t.barcode.sfBarcode} <SortIcon field="code" /></div>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.barcode.itemCodeLabel}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.barcode.itemNameLabel}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 cursor-pointer" onClick={() => handleSort("category")}>
                  <div className="flex items-center gap-1">{t.barcode.catLabel} <SortIcon field="category" /></div>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.barcode.colTargetId}</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.barcode.colActive}</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.inventory.colAction}</th>
              </tr></thead>
              <tbody>
                {sortedBarcodes.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">{t.barcode.noData}</td></tr>
                ) : sortedBarcodes.map((b) => (
                  <tr key={b.id}
                    className="border-b border-gray-50 hover:bg-blue-50/30"
                    onMouseEnter={() => setHoveredId(b.id)}
                    onMouseLeave={() => setHoveredId(null)}>
                    <td className="px-5 py-3 text-sm text-gray-400">{b.id}</td>
                    <td className="px-5 py-3 text-sm font-mono font-semibold text-gray-900">{b.code}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{b.itemCode}</td>
                    <td className="px-5 py-3 text-sm text-gray-900">{b.itemName}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[b.category] || ""}`}>{b.category}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 font-mono">
                      {b.targetUnitId ? `TU-${String(b.targetUnitId).padStart(3, "0")}` : "-"}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {b.isActive === "Y"
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><Check size={12} />{t.barcode.active}</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"><X size={12} />{t.barcode.inactive}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className={`flex justify-center gap-1 transition-opacity ${hoveredId === b.id ? 'opacity-100' : 'opacity-0'}`}>
                        <button onClick={() => { navigator.clipboard.writeText(b.code); setToast(t.barcode.copied(b.code)); setTimeout(() => setToast(""), 2000); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title={t.barcode.sfBarcode}>
                          <Copy size={15} />
                        </button>
                        <button onClick={() => setPrintItem(b)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title={t.barcode.print}>
                          <Printer size={15} />
                        </button>
                        <button onClick={() => { setEditTarget(b); setEditCode(b.code); setEditMemo(b.memo ?? ""); setEditIsActive(b.isActive === "Y" || b.isActive === "true" ? "Y" : "N"); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title={t.common.edit}>
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleDelete(b)}
                          className="p-1.5 rounded-lg hover:bg-rose-100 text-gray-400 hover:text-rose-600" title={t.common.delete}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden divide-y divide-gray-50">
            {sortedBarcodes.map((b) => (
              <div key={b.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono font-bold text-gray-900">{b.code}</span>
                  <div className="flex items-center gap-2">
                    {b.isActive === "Y"
                      ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{t.barcode.active}</span>
                      : <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t.barcode.inactive}</span>}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[b.category] || ""}`}>{b.category}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-700">{b.itemName}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {b.itemCode}{b.targetUnitId ? ` · TU-${String(b.targetUnitId).padStart(3, "0")}` : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPrintItem(b)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="라벨 인쇄">
                      <Printer size={15} />
                    </button>
                    <button onClick={() => { setEditTarget(b); setEditCode(b.code); setEditMemo(b.memo ?? ""); setEditIsActive(b.isActive === "Y" || b.isActive === "true" ? "Y" : "N"); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="수정">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(b)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500 font-semibold text-gray-700">{t.barcode.totalCount(sortedBarcodes.length)}</p>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
