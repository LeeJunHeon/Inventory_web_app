"use client";

import { useState } from "react";
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
        // TODO: 로그인 구현 후 실제 사용자 정보로 교체
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
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors relative">
              <Bell size={18} className="text-gray-500" />
              {/* TODO: 재고 부족 알림 수 뱃지 */}
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
