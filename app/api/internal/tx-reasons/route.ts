import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalAuth } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

// GET /api/internal/tx-reasons — 입출고 사유 목록 (챗봇 사유 선택용)
// id와 name 반환.
export async function GET(request: Request) {
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const reasons = await prisma.txReason.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(reasons);
  } catch (error) {
    console.error("GET /api/internal/tx-reasons error:", error);
    return NextResponse.json({ error: "사유 조회 실패" }, { status: 500 });
  }
}
