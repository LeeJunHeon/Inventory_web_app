import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/items/categories — 품목 카테고리 전체 조회
export async function GET() {
  try {
    const categories = await prisma.itemCategory.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories.map(c => ({
      id:       c.id,
      name:     c.name,
      parentId: c.parentId,
    })));
  } catch (error) {
    console.error("GET /api/items/categories error:", error);
    return NextResponse.json({ error: "카테고리 조회 실패" }, { status: 500 });
  }
}
