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
    const users = await prisma.user.findMany({
      where: { isActive: "Y" },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
