import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SummaryRow = {
  userId:       number | null;
  userName:     string;
  create:       number;
  update:       number;
  delete:       number;
  total:        number;
  lastActivity: string | null;
};

// GET /api/logs/summary?startDate=&endDate= — 사용자별 활동 집계
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || "";
    const endDate   = searchParams.get("endDate")   || "";

    // 날짜 필터는 /api/logs 와 동일 규칙
    const andConditions: any[] = [];
    if (startDate) andConditions.push({ createdAt: { gte: new Date(startDate) } });
    if (endDate)   andConditions.push({ createdAt: { lte: new Date(endDate + "T23:59:59.999Z") } });
    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const [byAction, byUser, users] = await Promise.all([
      prisma.activityLog.groupBy({
        by:     ["userId", "action"],
        where,
        _count: { _all: true },
      }),
      prisma.activityLog.groupBy({
        by:   ["userId"],
        where,
        _max: { createdAt: true },
      }),
      prisma.user.findMany({ select: { id: true, name: true } }),
    ]);

    const nameById = new Map(users.map(u => [u.id, u.name]));
    // userId가 null인 로그도 "-" 사용자로 묶어서 포함
    const keyOf = (userId: number | null) => String(userId ?? "null");
    const rows = new Map<string, SummaryRow>();

    const rowFor = (userId: number | null): SummaryRow => {
      const key = keyOf(userId);
      let row = rows.get(key);
      if (!row) {
        row = {
          userId,
          userName:     userId == null ? "-" : (nameById.get(userId) ?? `ID:${userId}`),
          create: 0, update: 0, delete: 0, total: 0,
          lastActivity: null,
        };
        rows.set(key, row);
      }
      return row;
    };

    for (const g of byAction) {
      const row   = rowFor(g.userId);
      const count = g._count._all;
      if (g.action === "CREATE")      row.create += count;
      else if (g.action === "UPDATE") row.update += count;
      else if (g.action === "DELETE") row.delete += count;
      row.total += count;
    }

    for (const g of byUser) {
      const row = rowFor(g.userId);
      row.lastActivity = g._max.createdAt?.toISOString() ?? null;
    }

    const data = [...rows.values()].sort((a, b) => b.total - a.total);

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/logs/summary error:", error);
    return NextResponse.json({ error: "요약 조회 실패" }, { status: 500 });
  }
}
