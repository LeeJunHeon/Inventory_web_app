import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/items/[id]/spec — 품목 스펙 조회 (웨이퍼 스펙 + 타겟 스펙)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const itemId = Number(idParam);
    if (isNaN(itemId)) {
      return NextResponse.json({ error: "유효하지 않은 ID" }, { status: 400 });
    }

    const [waferSpec, targetSpec] = await Promise.all([
      prisma.waferSpec.findUnique({ where: { itemId } }),
      prisma.targetSpec.findUnique({ where: { itemId } }),
    ]);

    return NextResponse.json({ waferSpec: waferSpec ?? null, targetSpec: targetSpec ?? null });
  } catch (error) {
    console.error("GET /api/items/[id]/spec error:", error);
    return NextResponse.json({ error: "스펙 조회 실패" }, { status: 500 });
  }
}
