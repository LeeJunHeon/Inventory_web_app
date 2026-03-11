"use client";

import { Home, Package, BarChart3, Clock, Target, QrCode, Users, LogOut, Boxes, X } from "lucide-react";

export type PageId = "dashboard" | "inventory" | "status" | "period" | "target" | "barcode" | "admin";

const NAV_ITEMS: { id: PageId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "대시보드", icon: Home },
  { id: "inventory", label: "재고 관리", icon: Package },
  { id: "status", label: "보유 현황", icon: BarChart3 },
  { id: "period", label: "기간별 조회", icon: Clock },
  { id: "target", label: "타겟 사용현황", icon: Target },
  { id: "barcode", label: "바코드", icon: QrCode },
  { id: "admin", label: "관리자 설정", icon: Users },
];

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ currentPage, onNavigate, isOpen, onClose }: SidebarProps) {
  const handleNav = (page: PageId) => {
    onNavigate(page);
    if (window.innerWidth < 1024) onClose();
  };

  return (
    <>
      {/* 모바일 오버레이 (lg 미만에서만) */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white border-r border-gray-100 flex flex-col
        transition-transform duration-300 shrink-0
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"}
      `}>
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

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
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
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">김</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">김철수</p>
              <p className="text-[10px] text-gray-400">관리자</p>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title="로그아웃">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
