"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n";
import { Save, Shield, UserPlus, Loader2, X, Trash2 } from "lucide-react";

interface UserPerm {
  id: number; name: string; email: string | null;
  role: string; isActive: boolean;
  perms: {
    main: boolean; status: boolean; period: boolean;
    userPerm: boolean; targetUsage: boolean; barcode: boolean; barcodeCreatePrint: boolean;
  };
}


function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-gray-200"}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

export default function AdminPage() {
  const { data: session } = useSession();
  const { t } = useT();
  const PERM_LABELS: { key: keyof UserPerm["perms"]; label: string }[] = [
    { key: "main",               label: t.admin.permDashboard },
    { key: "status",             label: t.admin.permStatus },
    { key: "period",             label: t.admin.permPeriod },
    { key: "targetUsage",        label: t.admin.permTarget },
    { key: "barcode",            label: t.admin.permBarcode },
    { key: "barcodeCreatePrint", label: t.admin.permBarcodeCreate },
    { key: "userPerm",           label: t.admin.permAdmin },
  ];
  const [users, setUsers]     = useState<UserPerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState("");
  const [showAdd, setShowAdd]         = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  // 새 사용자 폼
  const [newName, setNewName]   = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole]   = useState<"admin" | "employee">("employee");
  const [addError, setAddError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) setUsers(await res.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const updatePerm = (userId: number, permKey: keyof UserPerm["perms"], value: boolean) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, perms: { ...u.perms, [permKey]: value } } : u));
  };
  const updateRole = (userId: number, role: "admin" | "employee") => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
  };
  const toggleActive = (userId: number) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !u.isActive } : u));
  };

  // 변경사항 저장
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users }),
      });
      if (res.ok) showToast("✅ " + t.admin.saveSuccess);
      else        showToast("❌ " + t.admin.saveFailed);
    } catch { showToast("❌ " + t.common.networkError); }
    finally { setSaving(false); }
  };

  // 사용자 삭제
  const handleDelete = async (user: UserPerm) => {
    if (user.email && user.email === session?.user?.email) {
      showToast("❌ " + t.admin.cantDeleteSelf); return;
    }
    if (!confirm(t.admin.deleteConfirm(user.name))) return;

    try {
      const res  = await fetch(`/api/admin/users?userId=${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { showToast("❌ " + (data.error || t.admin.saveFailed)); return; }

      if (data.deactivated) {
        // 비활성 처리된 경우 목록 내 상태 업데이트
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: false } : u));
        showToast(`⚠️ ${data.message}`);
      } else {
        // 실제 삭제된 경우 목록에서 제거
        setUsers(prev => prev.filter(u => u.id !== user.id));
        showToast("✅ " + t.admin.deleteSuccess);
      }
    } catch { showToast("❌ " + t.common.networkError); }
  };

  // 사용자 추가
  const [adding, setAdding] = useState(false);
  const handleAddUser = async () => {
    if (!newName.trim() || !newEmail.trim()) { setAddError(t.admin.nameEmailRequired); return; }
    setAddError(""); setAdding(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || t.common.saveFail); return; }
      // 목록 새로고침
      const listRes = await fetch("/api/admin/users");
      if (listRes.ok) setUsers(await listRes.json());
      setNewName(""); setNewEmail(""); setNewRole("employee");
      setShowAdd(false);
      showToast("✅ " + t.admin.addSuccess);
    } catch { setAddError(t.common.networkError); }
    finally { setAdding(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-blue-500" />
      <span className="ml-2 text-sm text-gray-500">{t.common.loading}</span>
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

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.nav.admin}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t.admin.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInactive(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-colors ${
              showInactive
                ? "bg-gray-100 text-gray-700 border-gray-300"
                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
            }`}
          >
            {showInactive ? t.common.inactiveHide : t.common.inactiveInclude}
          </button>
          <button onClick={() => { setShowAdd(!showAdd); setAddError(""); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            <UserPlus size={16} />{t.admin.addUser}
          </button>
          <button onClick={handleSaveAll} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 shadow-sm disabled:opacity-60">
            <Save size={16} />{saving ? t.common.saving : t.admin.saveAll}
          </button>
        </div>
      </div>

      {/* 사용자 추가 폼 */}
      {showAdd && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-blue-900">{t.admin.addUserTitle}</h2>
            <button onClick={() => setShowAdd(false)} className="text-blue-400 hover:text-blue-700"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.admin.nameLabel}</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t.admin.namePlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.admin.emailLabel}</label>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={t.admin.emailPlaceholder}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">{t.admin.roleLabel}</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value as "admin" | "employee")}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none">
                <option value="employee">{t.admin.roleEmployee}</option>
                <option value="admin">{t.admin.roleAdmin}</option>
              </select>
            </div>
          </div>
          {addError && <p className="text-sm text-red-500">{addError}</p>}
          <button onClick={handleAddUser} disabled={adding}
            className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
            {adding ? t.admin.adding : t.admin.addBtn}
          </button>
        </div>
      )}

      {/* 데스크탑 테이블 */}
      <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.admin.colName}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t.admin.colEmail}</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.admin.colRole}</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">{t.admin.colActive}</th>
                {PERM_LABELS.map((p) => (
                  <th key={p.key} className="text-center text-xs font-semibold text-gray-500 px-3 py-3">{p.label}</th>
                ))}
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">{t.common.delete}</th>
              </tr>
            </thead>
            <tbody>
              {(() => { const visibleUsers = showInactive ? users : users.filter(u => u.isActive); return visibleUsers.length === 0 ? (
                <tr><td colSpan={5 + PERM_LABELS.length} className="px-5 py-12 text-center text-sm text-gray-400">{t.admin.noData}</td></tr>
              ) : visibleUsers.map((user) => (
                <tr key={user.id} className={`border-b border-gray-50 ${!user.isActive ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-600">
                        {user.name.charAt(0)}
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">{user.email}</td>
                  <td className="px-5 py-3 text-center">
                    <select value={user.role} onChange={(e) => updateRole(user.id, e.target.value as "admin" | "employee")}
                      className={`text-xs font-semibold px-3 py-1 rounded-full border-0 outline-none cursor-pointer ${user.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"}`}>
                      <option value="admin">{t.admin.roleAdmin}</option>
                      <option value="employee">{t.admin.roleEmployee}</option>
                    </select>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <Toggle checked={user.isActive} onChange={() => toggleActive(user.id)} />
                  </td>
                  {PERM_LABELS.map((p) => (
                    <td key={p.key} className="px-3 py-3 text-center">
                      <Toggle checked={user.perms[p.key]} onChange={(v) => updatePerm(user.id, p.key, v)} />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => handleDelete(user)}
                      disabled={user.email === session?.user?.email}
                      className="p-1.5 rounded-lg hover:bg-rose-100 text-gray-300 hover:text-rose-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={user.email === session?.user?.email ? t.admin.cantDeleteSelfTitle : t.common.delete}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              )); })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* 모바일 카드 */}
      <div className="lg:hidden space-y-3">
        {(showInactive ? users : users.filter(u => u.isActive)).map((user) => (
          <div key={user.id} className={`bg-white rounded-2xl border border-gray-100 p-4 space-y-3 ${!user.isActive ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                  {user.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-400">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${user.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"}`}>
                  {user.role === "admin" ? t.admin.roleAdmin : t.admin.roleEmployee}
                </span>
                <Toggle checked={user.isActive} onChange={() => toggleActive(user.id)} />
                <button
                  onClick={() => handleDelete(user)}
                  disabled={user.email === session?.user?.email}
                  className="p-1.5 rounded-lg hover:bg-rose-100 text-gray-300 hover:text-rose-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={user.email === session?.user?.email ? "본인 계정은 삭제 불가" : "삭제"}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PERM_LABELS.map((p) => (
                <div key={p.key} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-400">{p.label}</span>
                  <Toggle checked={user.perms[p.key]} onChange={(v) => updatePerm(user.id, p.key, v)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
