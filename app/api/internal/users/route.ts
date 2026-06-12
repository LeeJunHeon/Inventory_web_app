import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalAuth } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

// GET /api/internal/users?search= — 사용자 이름 검색 (챗봇 불출자 입력용)
// 활성 사용자만, id와 name 반환. 거래처 입력(partners)과 동일 패턴.
export async function GET(request: Request) {
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";

    const where: any = { isActive: "Y" };
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error("GET /api/internal/users error:", error);
    return NextResponse.json({ error: "사용자 조회 실패" }, { status: 500 });
  }
}
