import { prisma } from "@/lib/prisma";
import type { TabPerms } from "@/lib/menus";

/**
 * 이메일로 사용자 + user_tab_permission 을 읽어 탭 권한을 계산한다.
 * /api/auth/permissions 와 /api/portal-menus 가 같이 쓴다.
 * 사용자가 없으면 null.
 */
export async function getTabPermsByEmail(
  email: string
): Promise<{ isActive: boolean; perms: TabPerms } | null> {
  const user = await prisma.user.findUnique({
    where:   { email },
    include: { permission: true },
  });
  if (!user) return null;

  const p = user.permission;
  const isAdmin = user.role === "admin";
  // admin이고 user_tab_permission 레코드가 없으면 모든 권한 기본 true
  // admin이라도 레코드가 있으면 저장된 값을 우선 적용
  const yn = (v: string | null | undefined, adminDefault: boolean) => {
    if (v === null || v === undefined) return isAdmin ? adminDefault : false;
    return v === "Y";
  };

  return {
    isActive: user.isActive !== "N",
    perms: {
      role:                      user.role ?? "employee",
      canViewMain:               yn(p?.canViewMain,              true),
      canViewStatus:             yn(p?.canViewStatus,            true),
      canViewPeriod:             yn(p?.canViewPeriod,            true),
      canViewTargetUsage:        yn(p?.canViewTargetUsage,       true),
      canViewBarcode:            yn(p?.canViewBarcode,           true),
      canViewBarcodeCreatePrint: yn(p?.canViewBarcodeCreatePrint,true),
      canViewUserPerm:           yn(p?.canViewUserPerm,          isAdmin),
    },
  };
}
