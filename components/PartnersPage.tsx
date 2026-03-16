"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Edit, Trash2, Loader2, X } from "lucide-react";

interface Partner {
  id: number; name: string; type: string;
  managerName: string | null; contact: string | null; isActive: boolean;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  vendor:   { label: "거래처",  color: "bg-sky-100 text-sky-700" },
  disburse: { label: "불출처",  color: "bg-amber-100 text-amber-700" },
};

const EMPTY_FORM = { name: "", type: "vendor", managerName: "", contact: "" };

export default function PartnersPage() {
  const [partners, setPartners]     = useState<Partner[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [showForm, setShowForm]     = useState(false);
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
      if (search)               params.set("search", search);
      if (typeFilter !== "전체") params.set("type", typeFilter === "거래처" ? "vendor" : "disburse");
      const res = await fetch(`/api/partners?${params}`);
      if (res.ok) setPartners(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, typeFilter]);

  useEffect(() => {
    const t = setTimeout(fetchPartners, 300);
    return () => clearTimeout(t);
  }, [fetchPartners]);

  const openCreate = () => {
    setEditTarget(null); setForm(EMPTY_FORM); setFormError(""); setShowForm(true);
  };
  const openEdit = (p: Partner) => {
    setEditTarget(p);
    setForm({ name: p.name, type: p.type, managerName: p.managerName || "", contact: p.contact || "" });
    setFormError(""); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError("거래처명은 필수입니다."); return; }
    setFormError(""); setSaving(true);
    try {
      const url    = editTarget ? `/api/partners?id=${editTarget.id}` : "/api/partners";
      const method = editTarget ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        form.name.trim(),
          type:        form.type,
          managerName: form.managerName.trim() || null,
          contact:     form.contact.trim()     || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "저장 실패"); return; }
      showToast(editTarget ? "✅ 거래처가 수정되었습니다." : "✅ 거래처가 등록되었습니다.");
      setShowForm(false);
      fetchPartners();
    } catch { setFormError("네트워크 오류"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (p: Partner) => {
    if (!confirm(`"${p.name}" 거래처를 삭제하시겠습니까?\n(거래 내역이 있으면 비활성화 처리됩니다)`)) return;
    try {
      const res  = await fetch(`/api/partners?id=${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "삭제 실패"); return; }
      showToast(`✅ ${data.message}`);
      fetchPartners();
    } catch { alert("네트워크 오류"); }
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
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">거래처 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">거래처 및 불출처를 등록·수정·삭제합니다</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 shadow-sm">
          <Plus size={16} />신규 등록
        </button>
      </div>

      {/* 등록 / 수정 폼 */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-blue-900">{editTarget ? "거래처 수정" : "신규 거래처 등록"}</h2>
            <button onClick={() => setShowForm(false)} className="text-blue-400 hover:text-blue-700"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 구분 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">구분 <span className="text-rose-500">*</span></label>
              <div className="flex gap-2">
                {[{ val: "vendor", label: "거래처" }, { val: "disburse", label: "불출처" }].map(t => (
                  <button key={t.val} onClick={() => setForm(f => ({ ...f, type: t.val }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      form.type === t.val ? "border-blue-500 bg-blue-500 text-white" : "border-blue-200 bg-white text-blue-600"
                    }`}>{t.label}</button>
                ))}
              </div>
            </div>
            {/* 거래처명 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">거래처명 <span className="text-rose-500">*</span></label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="예: (주)실리콘밸리"
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {/* 담당자 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">담당자</label>
              <input value={form.managerName} onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))}
                placeholder="예: 홍길동"
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            {/* 연락처 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">연락처</label>
              <input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                placeholder="예: 02-1234-5678"
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          {formError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
              {saving ? "저장 중..." : editTarget ? "수정 저장" : "등록"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-5 py-2.5 bg-white border border-blue-200 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-50">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 검색 필터 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="거래처명 검색..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            {["전체", "거래처", "불출처"].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${typeFilter === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={24} className="animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500">로딩 중...</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">거래처명</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">구분</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">담당자</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">연락처</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">상태</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">작업</th>
              </tr></thead>
              <tbody>
                {partners.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">등록된 거래처가 없습니다</td></tr>
                ) : partners.map(p => (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-blue-50/30 group ${!p.isActive ? "opacity-40" : ""}`}>
                    <td className="px-5 py-3 text-sm font-semibold text-gray-900">{p.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_LABELS[p.type]?.color || "bg-gray-100 text-gray-600"}`}>
                        {TYPE_LABELS[p.type]?.label || p.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{p.managerName || "-"}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{p.contact || "-"}</td>
                    <td className="px-5 py-3 text-center">
                      {p.isActive
                        ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">활성</span>
                        : <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">비활성</span>}
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
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_LABELS[p.type]?.color || ""}`}>
                      {TYPE_LABELS[p.type]?.label || p.type}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit size={14} /></button>
                    <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-xs text-gray-400">{[p.managerName, p.contact].filter(Boolean).join(" · ") || "담당자 정보 없음"}</p>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">총 <span className="font-semibold text-gray-700">{partners.length}개</span></p>
          </div>
        </div>
      )}
    </div>
  );
}
