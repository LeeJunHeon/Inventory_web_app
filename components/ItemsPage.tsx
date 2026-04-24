"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, Edit, Trash2, Loader2, X, Check, Download } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { exportCSV } from "@/lib/csvUtils";

interface ItemOption {
  id: number; code: string; name: string;
  category: string; categoryId: number;
  unit: string | null; note: string | null; isActive: boolean;
}
interface CategoryOption { id: number; name: string; codePrefix: string | null; parentId: number | null; }

const CATS = ["전체", "웨이퍼", "타겟", "ALD", "가스", "기자재/소모품"];

const EMPTY_FORM = { code: "", name: "", categoryId: "", unit: "", note: "" };

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
  const handleExportCSV = () => {
    if (!items || items.length === 0) return;
    exportCSV(
      ["품목코드", "품목명", "품목군", "단위", "최소수량", "비고"],
      items.map((item: any) => [
        item.code, item.name, item.category?.name ?? item.category ?? "",
        item.unit ?? "", item.minQty ?? 0, item.note ?? "",
      ]),
      `품목관리_${new Date().toISOString().split("T")[0]}.csv`
    );
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // 품목군 목록 로드
  useEffect(() => {
    fetch("/api/items/categories")
      .then(r => r.json())
      .then(setCategories)
      .catch(() => {
        setCategories([
          { id: 1, name: "웨이퍼",      codePrefix: "W" },
          { id: 2, name: "타겟",        codePrefix: "T" },
          { id: 3, name: "가스",        codePrefix: "G" },
          { id: 4, name: "기자재/소모품", codePrefix: "E" },
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
    });
    setFormError("");
    setShowForm(true);
  };

  // 저장 (등록 or 수정)
  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.categoryId) {
      setFormError(t.items.formRequired); return;
    }
    setFormError(""); setSaving(true);
    try {
      const url    = editTarget ? `/api/items?id=${editTarget.id}` : "/api/items";
      const method = editTarget ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code:       form.code.trim(),
          name:       form.name.trim(),
          categoryId: Number(form.categoryId),
          unit:       form.unit.trim() || null,
          note:       form.note.trim() || null,
        }),
      });
      const data = await res.json();
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
            <Download size={15} />CSV
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
              <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
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
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
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
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.items.statusLabel}</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.inventory.colAction}</th>
              </tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">{t.items.noData}</td></tr>
                ) : items.map(item => (
                  <tr key={item.id} className={`border-b border-gray-50 hover:bg-blue-50/30 group ${!item.isActive ? "opacity-40" : ""}`}>
                    <td className="px-5 py-3 text-sm font-mono font-semibold text-gray-900">{item.code}</td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || ""}`}>{item.category}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{item.unit || "-"}</td>
                    <td className="px-5 py-3 text-sm text-gray-400">{item.note || "-"}</td>
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
