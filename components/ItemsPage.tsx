"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, Edit, Trash2, Loader2, X, Check, Download } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { buildSheet, exportXLSXSheets } from "@/lib/xlsxUtils";
import type { XlsxColumn } from "@/lib/xlsxUtils";
import { kstToday } from "@/lib/kst";
import SpecSelect from "@/components/SpecSelect";
import {
  WAFER_CATEGORY, WAFER_SPEC_KEYS, WAFER_SPEC_LABELS, WAFER_SPEC_DEFAULT_OPTIONS,
  parseDiameterFromCode, hasOrientation, waferSpecLabelsT,
} from "@/lib/waferSpec";
import type { WaferSpecKey, WaferSpecValues } from "@/lib/waferSpec";

interface ItemOption {
  id: number; code: string; name: string;
  category: string; categoryId: number;
  unit: string | null; note: string | null; isActive: boolean; minStockQty?: number;
  purity?: number | null; hasCopper?: string | null; copperThickness?: number | null; consumeAlertG?: number | null;
  waferSpec?: WaferSpecValues | null; specSummary?: string | null;
}
interface CategoryOption { id: number; name: string; codePrefix: string | null; parentId: number | null; }

const CATS = ["전체", "웨이퍼", "타겟", "ALD", "가스", "기자재/소모품"];

const EMPTY_FORM = { code: "", name: "", categoryId: "", unit: "", note: "", purity: "", hasCopper: "", copperThickness: "", consumeAlertG: "" };

type WaferForm = Record<WaferSpecKey, string>;
const EMPTY_WAFER_FORM: WaferForm = {
  orientation: "", diameterInch: "", waferType: "", dopant: "", grade: "",
  thicknessNote: "", resistivity: "", surface: "", oxidation: "",
};
/** 선택지 없이 자유 입력하는 칸 */
const WAFER_FREE_KEYS: WaferSpecKey[] = ["thicknessNote", "resistivity"];

export default function ItemsPage() {
  const { t } = useT();
  const CAT_LABEL: Record<string, string> = {
    "전체": t.barcode.catAll,
    "웨이퍼": t.inventory.catWafer,
    "타겟": t.inventory.catTarget,
    "ALD": "ALD",
    "가스": t.inventory.catGas,
    "기자재/소모품": t.inventory.catEquip,
  };
  const [items, setItems]                   = useState<ItemOption[]>([]);
  // 화면 표와 같은 열 (타겟 필터면 순도·Copper·Cu 두께) + 필요수량(보유현황과 같은 용어)
  const handleExportCSV = () => {
    if (!items || items.length === 0) return;
    const columns: XlsxColumn<ItemOption>[] = [
      { header: "품목코드", value: item => item.code },
      { header: "품목명",   value: item => item.name },
      { header: "품목군",   value: item => item.category },
      { header: "단위",     value: item => item.unit ?? "" },
      { header: "필요수량", value: item => item.minStockQty ?? 0 },
      { header: "비고",     value: item => item.note ?? "" },
      ...(catFilter === "타겟" ? [
        { header: "순도(%)",       value: (item: ItemOption) => item.purity ?? "-" },
        { header: "Copper",        value: (item: ItemOption) => item.hasCopper === "Y" ? "있음" : item.hasCopper === "N" ? "없음" : "-" },
        { header: "Cu 두께(inch)", value: (item: ItemOption) => item.copperThickness ?? "-" },
      ] : []),
      ...(catFilter === WAFER_CATEGORY ? WAFER_SPEC_KEYS.map(key => ({
        header: key === "diameterInch" ? `${WAFER_SPEC_LABELS[key]}(inch)` : WAFER_SPEC_LABELS[key],
        value: (item: ItemOption) => item.waferSpec?.[key] ?? "-",
      })) : []),
      { header: "상태",     value: item => item.isActive ? t.barcode.active : t.barcode.inactive },
    ];
    exportXLSXSheets([buildSheet("품목", columns, items)], `품목관리_${kstToday()}.xlsx`);
  };
  const [categories, setCategories]         = useState<CategoryOption[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [catFilter, setCatFilter]           = useState("전체");
  const [showForm, setShowForm]             = useState(false);
  const [editTarget, setEditTarget]         = useState<ItemOption | null>(null);
  const [form, setForm]                     = useState(EMPTY_FORM);
  const [saving, setSaving]                 = useState(false);
  const [formError, setFormError]           = useState("");
  const [toast, setToast]                   = useState("");
  const [waferForm, setWaferForm]           = useState<WaferForm>(EMPTY_WAFER_FORM);
  const [specOptions, setSpecOptions]       = useState<Record<WaferSpecKey, string[]>>(WAFER_SPEC_DEFAULT_OPTIONS);
  const waferLabels = waferSpecLabelsT(t);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // 웨이퍼 스펙 선택지 (DB 에 직접 입력된 값 포함). 실패하면 기본 선택지 유지
  useEffect(() => {
    fetch("/api/items/wafer-spec-options")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && typeof data === "object") setSpecOptions({ ...WAFER_SPEC_DEFAULT_OPTIONS, ...data }); })
      .catch(() => {});
  }, []);

  // 품목군 목록 로드
  useEffect(() => {
    fetch("/api/items/categories")
      .then(r => r.json())
      .then(setCategories)
      .catch(() => {
        setCategories([
          { id: 1, name: "웨이퍼",       codePrefix: "W", parentId: null },
          { id: 2, name: "타겟",         codePrefix: "T", parentId: null },
          { id: 3, name: "가스",         codePrefix: "G", parentId: null },
          { id: 4, name: "기자재/소모품", codePrefix: "E", parentId: null },
        ]);
        showToast(t.items.catLoadFailed);
      });
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)               params.set("search", search);
      if (catFilter !== "전체") params.set("category", catFilter);
      // isActive=false 포함해서 전체 조회 (관리 목적)
      const res = await fetch(`/api/items?${params}&showAll=true`);
      if (res.ok) setItems(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, catFilter]);

  useEffect(() => {
    const t = setTimeout(fetchItems, 300);
    return () => clearTimeout(t);
  }, [fetchItems]);

  // 폼 열기
  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setWaferForm(EMPTY_WAFER_FORM);
    setFormError("");
    setShowForm(true);
  };
  const openEdit = (item: ItemOption) => {
    setEditTarget(item);
    setForm({
      code: item.code,
      name: item.name,
      categoryId: String(item.categoryId),
      unit: item.unit || "",
      note: item.note || "",
      purity: item.purity?.toString() ?? "",
      hasCopper: item.hasCopper ?? "",
      copperThickness: item.copperThickness?.toString() ?? "",
      consumeAlertG: item.consumeAlertG?.toString() ?? "",
    });
    const ws = item.waferSpec;
    setWaferForm(Object.fromEntries(
      WAFER_SPEC_KEYS.map(key => [key, ws?.[key] != null ? String(ws[key]) : ""])
    ) as WaferForm);
    setFormError("");
    setShowForm(true);
  };

  // 저장 (등록 or 수정)
  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.categoryId) {
      setFormError(t.items.formRequired); return;
    }
    if (isWafer && (!waferForm.orientation.trim() || !waferForm.diameterInch.trim())) {
      setFormError(t.items.waferSpecRequired); return;
    }
    setFormError(""); setSaving(true);
    try {
      const url    = editTarget ? `/api/items?id=${editTarget.id}` : "/api/items";
      const method = editTarget ? "PUT" : "POST";
      const payload = {
        code:       form.code.trim(),
        name:       form.name.trim(),
        categoryId: Number(form.categoryId),
        unit:       form.unit.trim() || null,
        note:       form.note.trim() || null,
        purity: form.purity,
        hasCopper: form.hasCopper,
        copperThickness: form.copperThickness,
        consumeAlertG: form.consumeAlertG,
        ...(isWafer && { waferSpec: waferForm }),
      };
      const send = (confirmSpecChange: boolean) => fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmSpecChange ? { ...payload, confirmSpecChange: true } : payload),
      });
      let res  = await send(false);
      let data = await res.json();
      // 입출고 기록이 있는 품목의 스펙 변경 — 과거 기록 전체에 반영되므로 확인 후 재요청
      if (res.status === 409 && data.needsConfirm === "specChange") {
        if (!confirm(t.items.specChangeConfirm(Number(data.txCount) || 0, Array.isArray(data.changes) ? data.changes : []))) return;
        res  = await send(true);
        data = await res.json();
      }
      if (!res.ok) { setFormError(data.error || t.common.saveFail); return; }
      showToast("✅ " + (editTarget ? t.items.editSuccess : t.items.createSuccess));
      setShowForm(false);
      fetchItems();
    } catch { setFormError(t.common.networkError); }
    finally { setSaving(false); }
  };

  // 삭제 / 비활성화
  const handleDelete = async (item: ItemOption) => {
    if (!confirm(t.items.deleteConfirm(item.name))) return;
    try {
      const res  = await fetch(`/api/items?id=${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t.common.saveFail); return; }
      showToast("✅ " + t.items.deleteSuccess);
      fetchItems();
    } catch { alert(t.common.networkError); }
  };

  // 선택된 품목군이 "타겟"인지 판별
  const isTarget = form.categoryId
    ? categories.find(c => String(c.id) === String(form.categoryId))?.name === "타겟"
    : false;
  const isWaferCategoryId = (categoryId: string) =>
    !!categoryId && categories.find(c => String(c.id) === String(categoryId))?.name === WAFER_CATEGORY;
  const isWafer = isWaferCategoryId(form.categoryId);

  // 신규 등록: 직경 칸이 비어 있을 때만 품목코드(W-4-…)에서 직경을 채운다
  const autofillDiameter = (code: string, categoryId: string) => {
    if (editTarget || !isWaferCategoryId(categoryId)) return;
    const d = parseDiameterFromCode(code);
    if (d != null) setWaferForm(w => w.diameterInch ? w : { ...w, diameterInch: String(d) });
  };
  const specMissing = formError === t.items.waferSpecRequired;

  return (
    <div className="space-y-5">
      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.nav.items}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t.items.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} disabled={!items || items.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Download size={15} />Excel
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 shadow-sm">
            <Plus size={16} />{t.items.newItem}
          </button>
        </div>
      </div>

      {/* 등록 / 수정 폼 */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-blue-900">{editTarget ? t.items.editTitle : t.items.createTitle}</h2>
            <button onClick={() => setShowForm(false)} className="text-blue-400 hover:text-blue-700"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* 품목군 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.items.catLabel} <span className="text-rose-500">*</span></label>
              <select value={form.categoryId} onChange={e => { setForm(f => ({ ...f, categoryId: e.target.value })); autofillDiameter(form.code, e.target.value); }}
                disabled={!!editTarget}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none disabled:opacity-60">
                <option value="">{t.items.selectPlaceholder}</option>
                {/* 최상위 카테고리 */}
                {categories
                  .filter(c => c.parentId === null)
                  .map(parent => (
                    <optgroup key={parent.id} label={parent.name}>
                      {/* 서브 카테고리가 있으면 서브만 선택 가능 */}
                      {categories.filter(c => c.parentId === parent.id).length > 0
                        ? categories
                            .filter(c => c.parentId === parent.id)
                            .map(child => (
                              <option key={child.id} value={child.id}>
                                {child.name}
                              </option>
                            ))
                        : (
                          <option key={parent.id} value={parent.id}>
                            {parent.name}
                          </option>
                        )
                      }
                    </optgroup>
                  ))
                }
              </select>
            </div>
            {/* 품목코드 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.items.itemCodeLabel} <span className="text-rose-500">*</span></label>
              <input value={form.code} onChange={e => { setForm(f => ({ ...f, code: e.target.value })); autofillDiameter(e.target.value, form.categoryId); }}
                readOnly={!!editTarget}
                placeholder={t.items.itemCodePlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400 read-only:opacity-60" />
            </div>
            {/* 품목명 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.items.itemNameLabel} <span className="text-rose-500">*</span></label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t.items.itemNamePlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {/* 단위 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.items.unitLabel}</label>
              <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder={t.items.unitPlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {/* 비고 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.items.noteLabel}</label>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder={t.items.notePlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {/* 타겟 전용 스펙 */}
            {isTarget && (
              <>
                {/* 순도 */}
                <div>
                  <label className="block text-xs font-semibold text-blue-700 mb-1">순도 (%)</label>
                  <input type="number" step="0.001" value={form.purity}
                    onChange={e => setForm(f => ({ ...f, purity: e.target.value }))}
                    placeholder="예: 99.999"
                    className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                {/* Copper 유무 */}
                <div>
                  <label className="block text-xs font-semibold text-blue-700 mb-1">Copper 유무</label>
                  <select value={form.hasCopper}
                    onChange={e => setForm(f => ({ ...f, hasCopper: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">미지정</option>
                    <option value="Y">있음</option>
                    <option value="N">없음</option>
                  </select>
                </div>
                {/* Copper 두께 */}
                <div>
                  <label className="block text-xs font-semibold text-blue-700 mb-1">Copper 두께 (inch)</label>
                  <input type="number" step="0.001" value={form.copperThickness}
                    onChange={e => setForm(f => ({ ...f, copperThickness: e.target.value }))}
                    placeholder="예: 0.125"
                    className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                {/* 소진 알림 기준 */}
                <div>
                  <label className="block text-xs font-semibold text-blue-700 mb-1">소진 알림 기준 (g)</label>
                  <input type="number" step="0.001" value={form.consumeAlertG}
                    onChange={e => setForm(f => ({ ...f, consumeAlertG: e.target.value }))}
                    placeholder="예: 29 (비우면 알림 없음)"
                    className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
                  <p className="mt-1 text-[11px] text-blue-500">최초 측정값 대비 이만큼 줄면 Google Chat 알림</p>
                </div>
              </>
            )}
            {/* 웨이퍼 전용 스펙 — 방향·직경 필수 */}
            {isWafer && (
              <>
                <div className="sm:col-span-2 lg:col-span-3 pt-1">
                  <p className="text-xs font-bold text-blue-900">{t.items.waferSpecTitle}</p>
                  <p className="text-[11px] text-blue-500 mt-0.5">{t.items.waferSpecHint}</p>
                </div>
                {WAFER_SPEC_KEYS.map(key => {
                  const required = key === "orientation" || key === "diameterInch";
                  const set = (v: string) => setWaferForm(w => ({ ...w, [key]: v }));
                  return (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-blue-700 mb-1">
                        {waferLabels[key]}{key === "diameterInch" ? " (inch)" : ""}
                        {required && <span className="text-rose-500"> *</span>}
                      </label>
                      {WAFER_FREE_KEYS.includes(key) ? (
                        <input value={waferForm[key]} onChange={e => set(e.target.value)} maxLength={100}
                          placeholder={key === "thicknessNote" ? t.items.thicknessPlaceholder : t.items.resistivityPlaceholder}
                          className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
                      ) : (
                        <SpecSelect value={waferForm[key]} onChange={set} options={specOptions[key] ?? []}
                          invalid={required && specMissing && !waferForm[key].trim()} />
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
          {formError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
              {saving ? t.common.saving : editTarget ? t.items.editSave : t.items.createSave}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-5 py-2.5 bg-white border border-blue-200 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-50">
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {/* 검색 필터 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder={t.items.searchPlaceholder} value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 overflow-x-auto">
            {CATS.map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${catFilter === c ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{CAT_LABEL[c] || c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 품목 목록 */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={24} className="animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500">{t.common.loading}</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* 데스크탑 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.items.itemCodeLabel}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.items.itemNameLabel}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.items.catLabel}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.items.unitLabel}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.items.noteLabel}</th>
                {catFilter === "타겟" && <>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">순도</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Copper</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Cu 두께</th>
                </>}
                {catFilter === WAFER_CATEGORY && WAFER_SPEC_KEYS.map(key => (
                  <th key={key} className="text-left text-xs font-semibold text-gray-500 px-5 py-3 whitespace-nowrap">{waferLabels[key]}</th>
                ))}
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.items.statusLabel}</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.inventory.colAction}</th>
              </tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={catFilter === "타겟" ? 10 : catFilter === WAFER_CATEGORY ? 7 + WAFER_SPEC_KEYS.length : 7} className="px-5 py-12 text-center text-sm text-gray-400">{t.items.noData}</td></tr>
                ) : items.map(item => (
                  <tr key={item.id} className={`border-b border-gray-50 hover:bg-blue-50/30 group ${!item.isActive ? "opacity-40" : ""}`}>
                    <td className="px-5 py-3 text-sm font-mono font-semibold text-gray-900">{item.code}</td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || ""}`}>{item.category}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{item.unit || "-"}</td>
                    <td className="px-5 py-3 text-sm text-gray-400">{item.note || "-"}</td>
                    {catFilter === "타겟" && <>
                      <td className="px-5 py-3 text-sm text-gray-600">{item.purity != null ? `${item.purity}%` : "-"}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{item.hasCopper === "Y" ? "있음" : item.hasCopper === "N" ? "없음" : "-"}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{item.copperThickness != null ? `${item.copperThickness}"` : "-"}</td>
                    </>}
                    {catFilter === WAFER_CATEGORY && WAFER_SPEC_KEYS.map(key => (
                      <td key={key} className="px-5 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {key === "orientation" && !hasOrientation(item.waferSpec)
                          ? <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{t.items.orientationMissing}</span>
                          : key === "diameterInch"
                            ? (item.waferSpec?.diameterInch ? `${item.waferSpec.diameterInch}"` : "-")
                            : (item.waferSpec?.[key] || "-")}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-center">
                      {item.isActive
                        ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{t.barcode.active}</span>
                        : <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t.barcode.inactive}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(item)}
                          className="p-1.5 rounded-lg hover:bg-blue-100 text-gray-400 hover:text-blue-600" title={t.common.edit}>
                          <Edit size={15} />
                        </button>
                        <button onClick={() => handleDelete(item)}
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

          {/* 모바일 */}
          <div className="md:hidden divide-y divide-gray-50">
            {items.map(item => (
              <div key={item.id} className={`px-4 py-3 space-y-1.5 ${!item.isActive ? "opacity-40" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono font-bold text-gray-900">{item.code}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || ""}`}>{item.category}</span>
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit size={14} /></button>
                    <button onClick={() => handleDelete(item)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-400">{[item.unit, item.note].filter(Boolean).join(" · ") || "-"}</p>
                {item.category === WAFER_CATEGORY && item.specSummary && (
                  <p className={`text-[11px] ${hasOrientation(item.waferSpec) ? "text-violet-500" : "text-rose-600 font-semibold"}`}>
                    {item.specSummary}
                  </p>
                )}
                {catFilter === "타겟" && (
                  <p className="text-[11px] text-gray-400">
                    {[
                      `순도 ${item.purity != null ? item.purity + "%" : "-"}`,
                      `Cu ${item.hasCopper === "Y" ? "있음" : item.hasCopper === "N" ? "없음" : "-"}`,
                      `Cu두께 ${item.copperThickness != null ? item.copperThickness + '"' : "-"}`,
                    ].join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-700">{t.items.totalCount(items.length)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
