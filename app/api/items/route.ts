import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/items — 품목 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "";

    const where: any = { isActive: true };
    if (category && category !== "전체") {
      where.category = { name: category };
    }

    const items = await prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: { code: "asc" },
    });

    return NextResponse.json(items.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      category: item.category.name,
      unit: item.unit,
      spec: item.spec,
    })));
  } catch (error) {
    console.error("GET /api/items error:", error);
    return NextResponse.json({ error: "품목 조회 실패" }, { status: 500 });
  }
}
