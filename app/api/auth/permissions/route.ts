import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTabPermsByEmail } from "@/lib/tab-permissions";

// Next.js App Router의 GET 캐싱 비활성화 — 항상 최신 DB 값 반환
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const result = await getTabPermsByEmail(session.user.email);
    if (!result) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
    }

    return NextResponse.json(result.perms);
  } catch (error) {
    console.error("GET /api/auth/permissions error:", error);
    return NextResponse.json({ error: "권한 조회 실패" }, { status: 500 });
  }
}
