"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { Home, Package, BarChart3, Clock, Target, QrCode, Users, LogOut, Boxes, X, Layers, Building2, Search, FileText } from "lucide-react";

export type PageId =
  | "dashboard" | "inventory" | "status" | "period"
  | "target" | "barcode" | "tracing" | "items" | "partners" | "admin" | "logs";

interface Perms {
  role: string;
  canViewMain: boolean;
  canViewStatus: boolean;
  canViewPeriod: boolean;
  canViewTargetUsage: boolean;
  canViewBarcode: boolean;
  canViewBarcodeCreatePrint: boolean;
  canViewUserPerm: boolean;
}

const ALL_NAV_ITEMS: {
  id: PageId; label: string; icon: React.ElementType;
  group?: string; always?: boolean;
}[] = [
  { id: "dashboard", label: "대시보드",    icon: Home,      always: true },
  { id: "inventory", label: "재고 관리",   icon: Package,   always: true },
  { id: "status",    label: "보유 현황",   icon: BarChart3 },
  { id: "period",    label: "기간별 조회", icon: Clock },
  { id: "target",    label: "타겟 사용현황", icon: Target },
  { id: "barcode",   label: "바코드",      icon: QrCode },
  { id: "tracing",   label: "재고 추적",   icon: Search },
  { id: "items",     label: "품목 관리",   icon: Layers },
  { id: "partners",  label: "거래처 관리", icon: Building2, group: "마스터" },
  { id: "admin",     label: "관리자 설정", icon: Users,     group: "마스터" },
  { id: "logs",      label: "활동 로그",   icon: FileText,  group: "마스터" },
];

function isVisible(id: PageId, perms: Perms | null): boolean {
  if (!perms) return false;
  switch (id) {
    case "dashboard":  return perms.canViewMain;
    case "inventory":  return true;               // 전용 권한 없음 → 항상 표시
    case "status":     return perms.canViewStatus;
    case "period":     return perms.canViewPeriod;
    case "target":     return perms.canViewTargetUsage;
    case "barcode":    return perms.canViewBarcode;
    case "tracing":    return true;
    case "items":      return true;
    case "partners":   return perms.role === "admin";
    case "admin":      return perms.canViewUserPerm;
    case "logs":       return perms.role === "admin";
  }
}

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  userRole?: string;
}

export default function Sidebar({
  currentPage, onNavigate, isOpen, onClose,
  userName = "-", userRole = "-",
}: SidebarProps) {
  const [perms, setPerms]               = useState<Perms | null>(null);
  const [permsLoading, setPermsLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // userName이 확정될 때마다 최신 권한 재조회 (로그인 직후, 사용자 전환 시 반영)
  useEffect(() => {
    if (!userName || userName === "-" || userName === "로딩중...") return;
    setPermsLoading(true);
    fetch("/api/auth/permissions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPerms(data); })
      .catch(() => {})
      .finally(() => setPermsLoading(false));
  }, [userName]);

  const handleNav = (page: PageId) => {
    onNavigate(page);
    if (window.innerWidth < 1024) onClose();
  };

  // 표시할 메뉴 항목 필터링
  const visibleItems = perms
    ? ALL_NAV_ITEMS.filter(item => isVisible(item.id, perms))
    : [];

  const renderNavItems = () => {
    if (permsLoading) {
      return (
        <div className="space-y-1 px-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      );
    }

    let prevGroup: string | undefined = undefined;
    return visibleItems.map((item) => {
      const showDivider = item.group && item.group !== prevGroup;
      prevGroup = item.group;
      return (
        <div key={item.id}>
          {showDivider && (
            <div className="px-3 pt-3 pb-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                {item.group}
              </p>
            </div>
          )}
          <button
            onClick={() => handleNav(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              currentPage === item.id
                ? "bg-blue-50 text-blue-600 font-semibold"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        </div>
      );
    });
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white border-r border-gray-100 flex flex-col
        transition-transform duration-300 shrink-0
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"}
      `}>
        {/* 로고 */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Boxes size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900">재고관리</h1>
                <p className="text-[10px] text-gray-400">Inventory System</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 lg:hidden">
              <X size={18} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {renderNavItems()}
        </nav>

        {/* 사용자 정보 + 로그아웃 */}
        <div className="px-3 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
              {userName.charAt(0) || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
              <p className="text-[10px] text-gray-400">{userRole}</p>
            </div>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              title="로그아웃"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* 로그아웃 확인 모달 */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">로그아웃</h3>
            <p className="text-sm text-gray-500">로그아웃 하시겠습니까?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
                취소
              </button>
              <button onClick={() => signOut({ callbackUrl: "/login" })}
                className="px-4 py-2 text-sm font-bold text-white bg-rose-500 rounded-xl hover:bg-rose-600 transition-colors">
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
