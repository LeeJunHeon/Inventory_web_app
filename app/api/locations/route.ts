import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/locations — 위치 목록 조회
// ?type=target 을 붙이면 장비 위치(id >= 3)만 반환
// 파라미터 없으면 전체 반환
export async function GET(request: NextRequest) {
  try {
    const type  = new URL(request.url).searchParams.get("type");
    const where = type === "target" ? { id: { gte: 3 } } : {};

    const locations = await prisma.location.findMany({
      where,
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    return NextResponse.json(locations);
  } catch (error) {
    console.error("GET /api/locations error:", error);
    return NextResponse.json({ error: "위치 목록 조회 실패" }, { status: 500 });
  }
}
