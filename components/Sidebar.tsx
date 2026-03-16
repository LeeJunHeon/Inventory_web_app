"use client";

import { Home, Package, BarChart3, Clock, Target, QrCode, Users, LogOut, Boxes, X, Layers, Building2 } from "lucide-react";

export type PageId =
  | "dashboard" | "inventory" | "status" | "period"
  | "target" | "barcode" | "items" | "partners" | "admin";

const NAV_ITEMS: { id: PageId; label: string; icon: React.ElementType; group?: string }[] = [
  { id: "dashboard", label: "대시보드",    icon: Home },
  { id: "inventory", label: "재고 관리",   icon: Package },
  { id: "status",    label: "보유 현황",   icon: BarChart3 },
  { id: "period",    label: "기간별 조회", icon: Clock },
  { id: "target",    label: "타겟 사용현황", icon: Target },
  { id: "barcode",   label: "바코드",      icon: QrCode },
  // ── 마스터 데이터 ──
  { id: "items",    label: "품목 관리",   icon: Layers,    group: "마스터" },
  { id: "partners", label: "거래처 관리", icon: Building2, group: "마스터" },
  { id: "admin",    label: "관리자 설정", icon: Users,     group: "마스터" },
];

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
  const handleNav = (page: PageId) => {
    onNavigate(page);
    if (window.innerWidth < 1024) onClose();
  };

  const handleLogout = () => {
    // 로그인 기능 구현 전 임시 안내
    if (confirm("로그아웃 하시겠습니까?\n(현재는 로그인 기능이 구현 중입니다)")) {
      alert("로그아웃 처리되었습니다.");
    }
  };

  // 구분선 렌더링 (마스터 그룹 직전)
  const renderNavItems = () => {
    let prevGroup: string | undefined = undefined;
    return NAV_ITEMS.map((item) => {
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
              onClick={handleLogout}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              title="로그아웃"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
