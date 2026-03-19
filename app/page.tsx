"use client";

import { useState, useEffect } from "react";
import { Menu, Bell } from "lucide-react";
import Sidebar, { PageId } from "@/components/Sidebar";
import DashboardPage    from "@/components/DashboardPage";
import InventoryPage    from "@/components/InventoryPage";
import StatusPage       from "@/components/StatusPage";
import PeriodPage       from "@/components/PeriodPage";
import TargetUsagePage  from "@/components/TargetUsagePage";
import BarcodePage      from "@/components/BarcodePage";
import ItemsPage        from "@/components/ItemsPage";
import PartnersPage     from "@/components/PartnersPage";
import AdminPage        from "@/components/AdminPage";

export default function Home() {
  const [page, setPage]             = useState<PageId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortageCount, setShortageCount] = useState(0);
  const [showNotif, setShowNotif]   = useState(false);

  // 재고 부족 알림 수 조회
  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(data => setShortageCount(data.shortageCount || 0))
      .catch(() => {});
  }, [page]); // 페이지 전환 시마다 갱신

  const PAGE_TITLES: Record<PageId, string> = {
    dashboard: "대시보드",
    inventory: "재고 관리",
    status:    "보유 현황",
    period:    "기간별 조회",
    target:    "타겟 사용현황",
    barcode:   "바코드",
    items:     "품목 관리",
    partners:  "거래처 관리",
    admin:     "관리자 설정",
  };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <DashboardPage />;
      case "inventory": return <InventoryPage />;
      case "status":    return <StatusPage />;
      case "period":    return <PeriodPage />;
      case "target":    return <TargetUsagePage />;
      case "barcode":   return <BarcodePage />;
      case "items":     return <ItemsPage />;
      case "partners":  return <PartnersPage />;
      case "admin":     return <AdminPage />;
      default:          return <DashboardPage />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userName="관리자"
        userRole="admin"
      />

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 sm:px-5 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Menu size={18} className="text-gray-500" />
            </button>
            <span className="text-sm font-semibold text-gray-700 lg:hidden">
              {PAGE_TITLES[page]}
            </span>
          </div>
          <div className="flex items-center gap-3 relative">
            <button
              onClick={() => setShowNotif(!showNotif)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors relative"
            >
              <Bell size={18} className="text-gray-500" />
              {shortageCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-rose-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1">
                  {shortageCount}
                </span>
              )}
            </button>

            {/* 알림 드롭다운 */}
            {showNotif && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-bold text-gray-900">알림</p>
                </div>
                <div className="px-4 py-3">
                  {shortageCount > 0 ? (
                    <button
                      onClick={() => { setPage("status"); setShowNotif(false); }}
                      className="w-full text-left space-y-1 hover:bg-gray-50 -mx-2 px-2 py-2 rounded-lg transition-colors"
                    >
                      <p className="text-sm text-rose-600 font-semibold">재고 부족 {shortageCount}건</p>
                      <p className="text-xs text-gray-400">보유 현황에서 확인하세요</p>
                    </button>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-2">새로운 알림이 없습니다</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
