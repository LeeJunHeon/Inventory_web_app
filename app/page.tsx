"use client";

import { useState } from "react";
import { Menu, Bell } from "lucide-react";
import Sidebar, { PageId } from "@/components/Sidebar";
import DashboardPage from "@/components/DashboardPage";
import InventoryPage from "@/components/InventoryPage";
import TargetUsagePage from "@/components/TargetUsagePage";
import PlaceholderPage from "@/components/PlaceholderPage";

export default function Home() {
  const [page, setPage] = useState<PageId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const PAGE_TITLES: Record<PageId, string> = {
    dashboard: "대시보드",
    inventory: "재고 관리",
    status: "보유 현황",
    period: "기간별 조회",
    target: "타겟 사용현황",
    barcode: "바코드",
    admin: "관리자 설정",
  };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <DashboardPage />;
      case "inventory": return <InventoryPage />;
      case "target": return <TargetUsagePage />;
      case "status": return <PlaceholderPage title="보유 현황" desc="품목별 세부 보유현황을 확인합니다" />;
      case "period": return <PlaceholderPage title="기간별 조회" desc="기간을 지정하여 입출고 내역을 조회합니다" />;
      case "barcode": return <PlaceholderPage title="바코드 관리" desc="바코드 조회, 생성, 출력을 관리합니다" />;
      case "admin": return <PlaceholderPage title="관리자 설정" desc="사용자 권한 및 시스템 설정을 관리합니다" />;
      default: return <DashboardPage />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
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
            {/* 모바일에서 현재 페이지명 표시 */}
            <span className="text-sm font-semibold text-gray-700 lg:hidden">
              {PAGE_TITLES[page]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors relative">
              <Bell size={18} className="text-gray-500" />
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
