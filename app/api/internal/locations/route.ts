import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalAuth } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

// GET /api/internal/locations
// 위치 전체 조회 (id, name)
export async function GET(request: Request) {
  const authResult = await requireInternalAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const locations = await prisma.location.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    return NextResponse.json(locations);
  } catch (error) {
    console.error("GET /api/internal/locations error:", error);
    return NextResponse.json({ error: "위치 조회 실패" }, { status: 500 });
  }
}
