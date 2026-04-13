"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Save, Shield, UserPlus, Loader2, X, Trash2 } from "lucide-react";

interface UserPerm {
  id: number; name: string; email: string | null;
  role: string; isActive: boolean;
  perms: {
    main: boolean; status: boolean; period: boolean;
    userPerm: boolean; targetUsage: boolean; barcode: boolean; barcodeCreatePrint: boolean;
  };
}

const PERM_LABELS: { key: keyof UserPerm["perms"]; label: string }[] = [
  { key: "main",               label: "대시보드" },
  { key: "status",             label: "보유현황" },
  { key: "period",             label: "기간별조회" },
  { key: "targetUsage",        label: "타겟현황" },
  { key: "barcode",            label: "바코드" },
  { key: "barcodeCreatePrint", label: "바코드생성" },
  { key: "userPerm",           label: "관리자" },
];

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
      if (res.ok) showToast("✅ 저장되었습니다.");
      else        showToast("❌ 저장 실패");
    } catch { showToast("❌ 네트워크 오류"); }
    finally { setSaving(false); }
  };

  // 사용자 삭제
  const handleDelete = async (user: UserPerm) => {
    if (user.email && user.email === session?.user?.email) {
      showToast("❌ 본인 계정은 삭제할 수 없습니다."); return;
    }
    if (!confirm(`"${user.name}" 사용자를 삭제하시겠습니까?\n(연결된 데이터가 있으면 비활성 처리됩니다)`)) return;

    try {
      const res  = await fetch(`/api/admin/users?userId=${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { showToast(`❌ ${data.error || "삭제 실패"}`); return; }

      if (data.deactivated) {
        // 비활성 처리된 경우 목록 내 상태 업데이트
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: false } : u));
        showToast(`⚠️ ${data.message}`);
      } else {
        // 실제 삭제된 경우 목록에서 제거
        setUsers(prev => prev.filter(u => u.id !== user.id));
        showToast("✅ 사용자가 삭제되었습니다.");
      }
    } catch { showToast("❌ 네트워크 오류"); }
  };

  // 사용자 추가
  const [adding, setAdding] = useState(false);
  const handleAddUser = async () => {
    if (!newName.trim() || !newEmail.trim()) { setAddError("이름과 이메일을 입력해주세요."); return; }
    setAddError(""); setAdding(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || "추가 실패"); return; }
      // 목록 새로고침
      const listRes = await fetch("/api/admin/users");
      if (listRes.ok) setUsers(await listRes.json());
      setNewName(""); setNewEmail(""); setNewRole("employee");
      setShowAdd(false);
      showToast("✅ 사용자가 추가되었습니다.");
    } catch { setAddError("네트워크 오류"); }
    finally { setAdding(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-blue-500" />
      <span className="ml-2 text-sm text-gray-500">로딩 중...</span>
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
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">관리자 설정</h1>
          <p className="text-sm text-gray-500 mt-0.5">사용자 권한 및 시스템 설정을 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowAdd(!showAdd); setAddError(""); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            <UserPlus size={16} />사용자 추가
          </button>
          <button onClick={handleSaveAll} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 shadow-sm disabled:opacity-60">
            <Save size={16} />{saving ? "저장 중..." : "변경사항 저장"}
          </button>
        </div>
      </div>

      {/* 사용자 추가 폼 */}
      {showAdd && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-blue-900">새 사용자 추가</h2>
            <button onClick={() => setShowAdd(false)} className="text-blue-400 hover:text-blue-700"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">이름</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: 홍길동"
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">이메일</label>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="예: hong@company.com"
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">권한</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value as "admin" | "employee")}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none">
                <option value="employee">직원</option>
                <option value="admin">관리자</option>
              </select>
            </div>
          </div>
          {addError && <p className="text-sm text-red-500">{addError}</p>}
          <button onClick={handleAddUser} disabled={adding}
            className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-60">
            {adding ? "추가 중..." : "추가"}
          </button>
        </div>
      )}

      {/* 데스크탑 테이블 */}
      <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex justify-end px-5 pt-3">
          <button
            onClick={() => setShowInactive(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showInactive
                ? "bg-gray-200 text-gray-700 border-gray-300"
                : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
            }`}
          >
            {showInactive ? "비활성 숨기기" : "비활성 포함"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">이름</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">이메일</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">권한</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">활성</th>
                {PERM_LABELS.map((p) => (
                  <th key={p.key} className="text-center text-xs font-semibold text-gray-500 px-3 py-3">{p.label}</th>
                ))}
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">삭제</th>
              </tr>
            </thead>
            <tbody>
              {(() => { const visibleUsers = showInactive ? users : users.filter(u => u.isActive); return visibleUsers.length === 0 ? (
                <tr><td colSpan={5 + PERM_LABELS.length} className="px-5 py-12 text-center text-sm text-gray-400">등록된 사용자가 없습니다</td></tr>
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
                      <option value="admin">관리자</option>
                      <option value="employee">직원</option>
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
                      title={user.email === session?.user?.email ? "본인 계정은 삭제 불가" : "삭제"}
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
        <div className="flex justify-end">
          <button
            onClick={() => setShowInactive(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showInactive
                ? "bg-gray-200 text-gray-700 border-gray-300"
                : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
            }`}
          >
            {showInactive ? "비활성 숨기기" : "비활성 포함"}
          </button>
        </div>
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
                  {user.role === "admin" ? "관리자" : "직원"}
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
