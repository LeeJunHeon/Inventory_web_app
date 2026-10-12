// 메뉴 정의 — 사이드바·화면 가드·딥링크(?page=) 검증·포털 메뉴 API(/api/portal-menus)가 같이 쓴다.
// 클라이언트·서버 양쪽에서 import 하므로 서버 전용 모듈(prisma 등)을 여기서 import 하지 말 것.
import type { ko } from "@/messages/ko";

export type PageId =
  | "dashboard" | "inventory" | "status" | "period"
  | "target" | "ald" | "barcode" | "tracing" | "items" | "partners" | "admin" | "logs";

export const DEFAULT_PAGE: PageId = "dashboard";

/** /api/auth/permissions 응답 형식 */
export interface TabPerms {
  role: string;
  canViewMain: boolean;
  canViewStatus: boolean;
  canViewPeriod: boolean;
  canViewTargetUsage: boolean;
  canViewBarcode: boolean;
  canViewBarcodeCreatePrint: boolean;
  canViewUserPerm: boolean;
}

type NavKey = keyof typeof ko.nav;

/** 포털 런처와 약속한 아이콘 이름 (lucide-react 컴포넌트 이름) */
export type MenuIconName =
  | "Home" | "Package" | "BarChart3" | "Clock" | "QrCode" | "Search" | "Layers"
  | "Target" | "Droplet" | "Building2" | "Users" | "FileText";

export interface MenuDef {
  page: PageId;
  labelKey: NavKey;      // ko.nav / en.nav 키
  icon: MenuIconName;
  groupKey?: NavKey;     // 사이드바 그룹 구분선 라벨 키
  adminOnly: boolean;
}

// 사이드바 표시 순서 그대로
export const MENUS: MenuDef[] = [
  { page: "dashboard", labelKey: "dashboard",     icon: "Home",      adminOnly: false },
  { page: "inventory", labelKey: "inventory",     icon: "Package",   adminOnly: false },
  { page: "status",    labelKey: "status",        icon: "BarChart3", adminOnly: false },
  { page: "period",    labelKey: "period",        icon: "Clock",     adminOnly: false },
  { page: "barcode",   labelKey: "barcode",       icon: "QrCode",    adminOnly: false },
  { page: "tracing",   labelKey: "tracing",       icon: "Search",    adminOnly: false },
  { page: "items",     labelKey: "items",         icon: "Layers",    adminOnly: false },
  { page: "target",    labelKey: "targetSputter", icon: "Target",    groupKey: "targetGroup", adminOnly: false },
  { page: "ald",       labelKey: "targetAld",     icon: "Droplet",   groupKey: "targetGroup", adminOnly: false },
  { page: "partners",  labelKey: "partners",      icon: "Building2", groupKey: "master", adminOnly: true },
  { page: "admin",     labelKey: "admin",         icon: "Users",     groupKey: "master", adminOnly: true },
  { page: "logs",      labelKey: "logs",          icon: "FileText",  groupKey: "master", adminOnly: true },
];

const PAGE_ID_SET = new Set<string>(MENUS.map(m => m.page));

export function isPageId(v: unknown): v is PageId {
  return typeof v === "string" && PAGE_ID_SET.has(v);
}

/** 권한으로 해당 메뉴를 볼 수 있는지 (권한 로딩 중 처리는 호출하는 쪽에서) */
export function canViewPage(page: PageId, perms: TabPerms): boolean {
  switch (page) {
    case "dashboard":  return perms.canViewMain;
    case "inventory":  return true;
    case "status":     return perms.canViewStatus;
    case "period":     return perms.canViewPeriod;
    case "target":     return perms.canViewTargetUsage;
    case "ald":        return perms.canViewTargetUsage;
    case "barcode":    return perms.canViewBarcode;
    case "tracing":    return true;
    case "items":      return true;
    case "partners":   return perms.role === "admin";
    case "admin":      return perms.canViewUserPerm;
    case "logs":       return perms.role === "admin";
  }
}
