"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Menu, Bell, Lock, Globe } from "lucide-react";
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
import StockTracingPage from "@/components/StockTracingPage";
import LogPage          from "@/components/LogPage";
import { useT } from "@/lib/i18n";

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

function NoAccess({ pageName }: { pageName: string }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
        <Lock size={22} className="text-gray-400" />
      </div>
      <p className="text-base font-semibold text-gray-700">{t.header.noAccess}</p>
      <p className="text-sm text-gray-400">
        <span className="font-medium text-gray-500">{pageName}</span> {t.header.noAccessDesc}<br />
        {t.header.contactAdmin}
      </p>
    </div>
  );
}

export default function Home() {
  const { data: session } = useSession();
  const { lang, setLang, t } = useT();
  const [page, setPage]               = useState<PageId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 클라이언트에서만 모바일 감지 → 모바일이면 초기에 닫음
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);
  const [shortageCount, setShortageCount] = useState(0);
  const [shortageItems, setShortageItems] = useState<{
    itemId: number; itemName: string; itemCode: string; currentQty: number; minQty: number;
  }[]>([]);
  const [showNotif, setShowNotif]     = useState(false);
  const [perms, setPerms]             = useState<Perms | null>(null);
  const [statusLocationId, setStatusLocationId] = useState<number | null>(null);
  const [statusStockFilter, setStatusStockFilter] = useState<"전체" | "보유중" | "미보유">("전체");
  const [inventoryInitialFilter, setInventoryInitialFilter] = useState<{ type?: string; date?: string } | null>(null);

  const userName = session?.user?.name ?? "로딩중...";
  const userRole = (session?.user as any)?.role ?? "";

  // 세션 확정 후 권한 조회
  useEffect(() => {
    if (!userName || userName === "-" || userName === "로딩중...") return;
    fetch("/api/auth/permissions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPerms(data); })
      .catch(() => {});
  }, [userName]);

  // 재고 부족 알림 수 조회
  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(data => {
        setShortageCount(data.shortageCount || 0);
        setShortageItems(data.shortageItems || []);
      })
      .catch(() => {});
  }, [page]);

  const PAGE_TITLES: Record<PageId, string> = {
    dashboard: t.nav.dashboard,
    inventory: t.nav.inventory,
    status:    t.nav.status,
    period:    t.nav.period,
    target:    t.nav.target,
    barcode:   t.nav.barcode,
    tracing:   t.nav.tracing,
    items:     t.nav.items,
    partners:  t.nav.partners,
    admin:     t.nav.admin,
    logs:      t.nav.logs,
  };

  // 현재 페이지 접근 권한 확인
  function canAccess(p: PageId): boolean {
    if (!perms) return true; // 로딩 중엔 허용 (깜빡임 방지)
    switch (p) {
      case "dashboard":  return perms.canViewMain;
      case "inventory":  return true;
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

  const renderPage = () => {
    if (!canAccess(page)) return <NoAccess pageName={PAGE_TITLES[page]} />;
    switch (page) {
      case "dashboard": return (
        <DashboardPage
          onNavigate={(p, lid, filter) => {
            setPage(p);
            if (lid !== undefined) setStatusLocationId(lid ?? null);
            if (filter?.stockFilter) setStatusStockFilter(filter.stockFilter as "전체" | "보유중" | "미보유");
            else setStatusStockFilter("전체");
            if (filter) setInventoryInitialFilter(filter);
            else setInventoryInitialFilter(null);
          }}
        />
      );
      case "inventory": return (
        <InventoryPage
          initialTypeFilter={inventoryInitialFilter?.type}
          initialStartDate={inventoryInitialFilter?.date}
          initialEndDate={inventoryInitialFilter?.date}
          onFilterApplied={() => setInventoryInitialFilter(null)}
        />
      );
      case "status":    return <StatusPage initialLocationId={statusLocationId} initialStockFilter={statusStockFilter} />;
      case "period":    return <PeriodPage />;
      case "target":    return <TargetUsagePage />;
      case "barcode":   return <BarcodePage />;
      case "tracing":   return <StockTracingPage />;
      case "items":     return <ItemsPage />;
      case "partners":  return <PartnersPage />;
      case "admin":     return <AdminPage />;
      case "logs":      return <LogPage />;
      default:          return <DashboardPage />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        currentPage={page}
        onNavigate={(p) => {
          if (p === "status") {
            setStatusLocationId(null);
            setStatusStockFilter("전체");
          }
          setPage(p);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userName={userName}
        userRole={userRole}
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
          <div className="flex items-center gap-2 relative">
            {/* 언어 전환 버튼 */}
            <button
              onClick={() => setLang(lang === "ko" ? "en" : "ko")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            >
              <Globe size={16} />
              <span className="text-xs font-semibold">{lang === "ko" ? "EN" : "KO"}</span>
            </button>

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
              <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">{t.header.alerts}</p>
                  {shortageCount > 0 && (
                    <span className="text-xs font-semibold text-rose-500">
                      재고 부족 {shortageCount}{t.header.shortageSuffix}
                    </span>
                  )}
                </div>
                {shortageCount > 0 ? (
                  <>
                    <ul className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                      {shortageItems.map((item) => (
                        <li key={item.itemId} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.itemName}</p>
                            <p className="text-xs text-gray-400">{item.itemCode}</p>
                          </div>
                          <div className="ml-3 shrink-0 text-right">
                            <p className="text-sm font-bold text-rose-500">{item.currentQty}{lang === "ko" ? "개" : ""}</p>
                            <p className="text-xs text-gray-400">{t.header.minStock} {item.minQty}{lang === "ko" ? "개" : ""}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="px-4 py-2.5 border-t border-gray-100">
                      <button
                        onClick={() => { setPage("status"); setShowNotif(false); }}
                        className="w-full text-xs font-semibold text-blue-500 hover:text-blue-600 text-center py-1"
                      >
                        {t.header.viewAll}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="px-4 py-4">
                    <p className="text-sm text-gray-400 text-center">{t.header.noAlerts}</p>
                  </div>
                )}
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
