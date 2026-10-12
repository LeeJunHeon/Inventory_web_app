import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ko } from "@/messages/ko";
import { MENUS, canViewPage } from "@/lib/menus";
import { getTabPermsByEmail } from "@/lib/tab-permissions";

// 포털 런처용 메뉴 목록 — 현재 사용자가 사이드바에서 볼 수 있는 메뉴만, 사이드바 순서로
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: NO_STORE });
    }

    const result = await getTabPermsByEmail(session.user.email);
    const perms = result?.isActive ? result.perms : null;

    const menus = perms
      ? MENUS.filter(m => canViewPage(m.page, perms)).map(m => ({
          page:      m.page,
          label:     ko.nav[m.labelKey],
          icon:      m.icon,
          adminOnly: m.adminOnly,
        }))
      : [];

    return NextResponse.json({ app: "inventory", menus }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/portal-menus error:", error);
    return NextResponse.json({ error: "메뉴 조회 실패" }, { status: 500, headers: NO_STORE });
  }
}
