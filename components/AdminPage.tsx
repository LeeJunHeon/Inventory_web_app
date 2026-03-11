"use client";

import { useState } from "react";
import { Plus, Save, Trash2, Shield, ShieldCheck, UserPlus } from "lucide-react";

interface UserPerm {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee";
  isActive: boolean;
  perms: {
    inventory: boolean;
    status: boolean;
    period: boolean;
    target: boolean;
    barcode: boolean;
    barcodeCreate: boolean;
    admin: boolean;
  };
}

const SAMPLE_USERS: UserPerm[] = [
  { id: 1, name: "김철수", email: "cskim@company.com", role: "admin", isActive: true,
    perms: { inventory: true, status: true, period: true, target: true, barcode: true, barcodeCreate: true, admin: true } },
  { id: 2, name: "이영희", email: "yhlee@company.com", role: "admin", isActive: true,
    perms: { inventory: true, status: true, period: true, target: true, barcode: true, barcodeCreate: true, admin: false } },
  { id: 3, name: "박민수", email: "mspark@company.com", role: "employee", isActive: true,
    perms: { inventory: true, status: true, period: true, target: false, barcode: false, barcodeCreate: false, admin: false } },
  { id: 4, name: "정수진", email: "sjjung@company.com", role: "employee", isActive: true,
    perms: { inventory: true, status: true, period: false, target: false, barcode: false, barcodeCreate: false, admin: false } },
  { id: 5, name: "최동훈", email: "dhchoi@company.com", role: "employee", isActive: false,
    perms: { inventory: true, status: true, period: false, target: false, barcode: false, barcodeCreate: false, admin: false } },
];

const PERM_LABELS: { key: keyof UserPerm["perms"]; label: string }[] = [
  { key: "inventory", label: "재고관리" },
  { key: "status", label: "보유현황" },
  { key: "period", label: "기간별조회" },
  { key: "target", label: "타겟현황" },
  { key: "barcode", label: "바코드" },
  { key: "barcodeCreate", label: "바코드생성" },
  { key: "admin", label: "관리자" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-gray-200"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserPerm[]>(SAMPLE_USERS);

  const updatePerm = (userId: number, permKey: keyof UserPerm["perms"], value: boolean) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, perms: { ...u.perms, [permKey]: value } } : u
      )
    );
  };

  const updateRole = (userId: number, role: "admin" | "employee") => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
  };

  const toggleActive = (userId: number) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: !u.isActive } : u)));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">관리자 설정</h1>
          <p className="text-sm text-gray-500 mt-0.5">사용자 권한 및 시스템 설정을 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            <UserPlus size={16} />
            사용자 추가
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 shadow-sm">
            <Save size={16} />
            변경사항 저장
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-sm text-amber-800">
          <span className="font-semibold">참고:</span> employee 권한은 단가/금액이 숨겨지며, 수정/삭제 기능이 제한됩니다.
        </p>
      </div>

      {/* 데스크탑 테이블 */}
      <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
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
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
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
                    <select
                      value={user.role}
                      onChange={(e) => updateRole(user.id, e.target.value as "admin" | "employee")}
                      className={`text-xs font-semibold px-3 py-1 rounded-full border-0 outline-none cursor-pointer ${
                        user.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 모바일 카드 */}
      <div className="lg:hidden space-y-3">
        {users.map((user) => (
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
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  user.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"
                }`}>
                  {user.role === "admin" ? "관리자" : "직원"}
                </span>
                <Toggle checked={user.isActive} onChange={() => toggleActive(user.id)} />
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
