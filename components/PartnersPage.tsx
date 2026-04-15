"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Edit, Trash2, Loader2, X, Download } from "lucide-react";
import { useT } from "@/lib/i18n";

function exportCSV(headers: string[], rows: (string | number | null | undefined)[][], filename: string) {
  const BOM = "\uFEFF";
  const csv = BOM + [headers, ...rows]
    .map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

interface Partner {
  id: number; name: string;
  managerName: string | null; contact: string | null; isActive: boolean;
}

const EMPTY_FORM = { name: "", managerName: "", contact: "" };

export default function PartnersPage() {
  const { t } = useT();
  const [partners, setPartners]     = useState<Partner[]>([]);
  const handleExportCSV = () => {
    if (!partners || partners.length === 0) return;
    exportCSV(
      ["거래처명", "담당자", "연락처", "이메일", "활성여부"],
      partners.map((p: any) => [
        p.name, p.managerName ?? "", p.contact ?? "",
        p.email ?? "", p.isActive === true || p.isActive === "Y" ? "활성" : "비활성",
      ]),
      `거래처관리_${new Date().toISOString().split("T")[0]}.csv`
    );
  };
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]     = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Partner | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState("");
  const [toast, setToast]           = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/partners?${params}`);
      if (res.ok) setPartners(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchPartners, 300);
    return () => clearTimeout(t);
  }, [fetchPartners]);

  const openCreate = () => {
    setEditTarget(null); setForm(EMPTY_FORM); setFormError(""); setShowForm(true);
  };
  const openEdit = (p: Partner) => {
    setEditTarget(p);
    setForm({ name: p.name, managerName: p.managerName || "", contact: p.contact || "" });
    setFormError(""); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError(t.partners.nameRequired); return; }
    setFormError(""); setSaving(true);
    try {
      const url    = editTarget ? `/api/partners?id=${editTarget.id}` : "/api/partners";
      const method = editTarget ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        form.name.trim(),
          managerName: form.managerName.trim() || null,
          contact:     form.contact.trim()     || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || t.common.saveFail); return; }
      showToast("✅ " + (editTarget ? t.partners.editSuccess : t.partners.createSuccess));
      setShowForm(false);
      fetchPartners();
    } catch { setFormError(t.common.networkError); }
    finally { setSaving(false); }
  };

  const handleDelete = async (p: Partner) => {
    if (!confirm(t.partners.deleteConfirm(p.name))) return;
    try {
      const res  = await fetch(`/api/partners?id=${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t.common.saveFail); return; }
      showToast("✅ " + t.partners.deleteSuccess);
      fetchPartners();
    } catch { alert(t.common.networkError); }
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.nav.partners}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t.partners.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} disabled={!partners || partners.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Download size={15} />CSV
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 shadow-sm">
            <Plus size={16} />{t.partners.newPartner}
          </button>
        </div>
      </div>

      {/* 등록 / 수정 폼 */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-blue-900">{editTarget ? t.partners.editTitle : t.partners.createTitle}</h2>
            <button onClick={() => setShowForm(false)} className="text-blue-400 hover:text-blue-700"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 거래처명 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.partners.nameLabel} <span className="text-rose-500">*</span></label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t.partners.namePlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {/* 담당자 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.partners.managerLabel}</label>
              <input value={form.managerName} onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))}
                placeholder={t.partners.managerPlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {/* 연락처 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.partners.contactLabel}</label>
              <input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                placeholder={t.partners.contactPlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          {formError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
              {saving ? t.common.saving : editTarget ? t.partners.editSave : t.partners.createSave}
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
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder={t.partners.searchPlaceholder} value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={24} className="animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500">{t.common.loading}</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.partners.nameLabel}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.partners.managerLabel}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.partners.contactLabel}</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.items.statusLabel}</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.inventory.colAction}</th>
              </tr></thead>
              <tbody>
                {partners.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-400">{t.partners.noData}</td></tr>
                ) : partners.map(p => (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-blue-50/30 group ${!p.isActive ? "opacity-40" : ""}`}>
                    <td className="px-5 py-3 text-sm font-semibold text-gray-900">{p.name}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{p.managerName || "-"}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{p.contact || "-"}</td>
                    <td className="px-5 py-3 text-center">
                      {p.isActive
                        ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{t.barcode.active}</span>
                        : <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t.barcode.inactive}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(p)}
                          className="p-1.5 rounded-lg hover:bg-blue-100 text-gray-400 hover:text-blue-600"><Edit size={15} /></button>
                        <button onClick={() => handleDelete(p)}
                          className="p-1.5 rounded-lg hover:bg-rose-100 text-gray-400 hover:text-rose-600"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 */}
          <div className="md:hidden divide-y divide-gray-50">
            {partners.map(p => (
              <div key={p.id} className={`px-4 py-3 space-y-1 ${!p.isActive ? "opacity-40" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit size={14} /></button>
                    <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-xs text-gray-400">{[p.managerName, p.contact].filter(Boolean).join(" · ") || t.partners.noManagerInfo}</p>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-700">{t.partners.totalCount(partners.length)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
