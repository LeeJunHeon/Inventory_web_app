import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Next.js App Router의 GET 캐싱 비활성화 — 항상 최신 DB 값 반환
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where:   { email: session.user.email },
      include: { permission: true },
    });

    if (!user) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
    }

    const p = user.permission;
    const isAdmin = user.role === "admin";
    // admin이고 user_tab_permission 레코드가 없으면 모든 권한 기본 true
    // admin이라도 레코드가 있으면 저장된 값을 우선 적용
    const yn = (v: string | null | undefined, adminDefault: boolean) => {
      if (v === null || v === undefined) return isAdmin ? adminDefault : false;
      return v === "Y";
    };

    return NextResponse.json({
      role:                      user.role ?? "employee",
      canViewMain:               yn(p?.canViewMain,              true),
      canViewStatus:             yn(p?.canViewStatus,            true),
      canViewPeriod:             yn(p?.canViewPeriod,            true),
      canViewTargetUsage:        yn(p?.canViewTargetUsage,       true),
      canViewBarcode:            yn(p?.canViewBarcode,           true),
      canViewBarcodeCreatePrint: yn(p?.canViewBarcodeCreatePrint,true),
      canViewUserPerm:           yn(p?.canViewUserPerm,          isAdmin),
    });
  } catch (error) {
    console.error("GET /api/auth/permissions error:", error);
    return NextResponse.json({ error: "권한 조회 실패" }, { status: 500 });
  }
}
