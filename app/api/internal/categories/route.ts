import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalAuth } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

// GET /api/internal/categories
// 품목 카테고리 전체 조회 (계층 파악용 parentId 포함)
export async function GET(request: Request) {
  const authResult = await requireInternalAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const categories = await prisma.itemCategory.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true, parentId: true },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error("GET /api/internal/categories error:", error);
    return NextResponse.json({ error: "카테고리 조회 실패" }, { status: 500 });
  }
}
