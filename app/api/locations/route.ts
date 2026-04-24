import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const locations = await prisma.location.findMany({
      where: type ? { type } : undefined,
      orderBy: { id: "asc" },
    });

    return NextResponse.json(locations);
  } catch (error) {
    console.error("GET /api/locations error:", error);
    return NextResponse.json({ error: "위치 조회 실패" }, { status: 500 });
  }
}
