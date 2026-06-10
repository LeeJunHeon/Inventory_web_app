import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalAuth } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

// GET /api/internal/items?search=&category=
// 기존 app/api/items GET 로직 재사용 (ALD 계층 처리 포함, 기본 isActive=true)
export async function GET(request: NextRequest) {
  const authResult = await requireInternalAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "";
    const search   = searchParams.get("search")   || "";
    const showAll  = searchParams.get("showAll")  === "true";

    const where: any = {};
    if (!showAll) {
      where.isActive = true;
    }

    if (category && category !== "전체") {
      // ALD 조회 시 서브 카테고리(ALD Canister, ALD Precursor 등) 포함
      where.category = category === "ALD"
        ? {
            OR: [
              { name: "ALD" },
              { parent: { name: "ALD" } },
            ],
          }
        : { name: category };
    }
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: { code: "asc" },
    });

    return NextResponse.json(items.map((item) => ({
      id:          item.id,
      code:        item.code,
      name:        item.name,
      category:    item.category.name,
      categoryId:  item.categoryId,
      unit:        item.unit,
      minStockQty: item.minStockQty,
    })));
  } catch (error) {
    console.error("GET /api/internal/items error:", error);
    return NextResponse.json({ error: "품목 조회 실패" }, { status: 500 });
  }
}
