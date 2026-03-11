"use client";

import { Home, Package, BarChart3, Clock, Target, QrCode, Users, LogOut, Boxes } from "lucide-react";

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
}

export default function Sidebar({ currentPage, onNavigate, isOpen }: SidebarProps) {
  return (
    <aside className={`${isOpen ? "w-60" : "w-0 overflow-hidden"} bg-white border-r border-gray-100 flex flex-col transition-all duration-300 shrink-0`}>
      {/* 로고 */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Boxes size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">재고관리</h1>
            <p className="text-[10px] text-gray-400">Inventory System</p>
          </div>
        </div>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
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

      {/* 사용자 */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
            김
          </div>
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
  );
}
