import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const reasons = await prisma.txReason.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    return NextResponse.json(reasons);
  } catch {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
