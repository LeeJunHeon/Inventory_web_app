import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/chamber-slots/history?locationId={id}&page=1&limit=5
// GET /api/chamber-slots/history?targetUnitId={id}&page=1&limit=5
// GET /api/chamber-slots/history?locationId={id}&all=true   → 전체 데이터 (CSV용)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locationIdParam = searchParams.get("locationId");
    const targetUnitIdParam = searchParams.get("targetUnitId");
    const all = searchParams.get("all") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "5", 10)));
    const skip = (page - 1) * limit;

    if (!locationIdParam && !targetUnitIdParam) {
      return NextResponse.json({ error: "locationId 또는 targetUnitId가 필요합니다." }, { status: 400 });
    }

    const where: any = {};
    if (locationIdParam) where.locationId = Number(locationIdParam);
    if (targetUnitIdParam) {
      where.OR = [
        { targetUnitId: Number(targetUnitIdParam) },
        { previousTargetUnitId: Number(targetUnitIdParam) },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.chamberSlotLog.count({ where }),
      prisma.chamberSlotLog.findMany({
        where,
        include: {
          location: true,
          targetUnit: { include: { item: true, barcodes: { take: 1 } } },
          previousTargetUnit: { include: { item: true, barcodes: { take: 1 } } },
          changedBy: { select: { id: true, name: true } },
        },
        orderBy: { changedAt: "desc" },
        ...(all ? {} : { skip, take: limit }),
      }),
    ]);

    return NextResponse.json({
      total,
      page: all ? 1 : page,
      limit: all ? total : limit,
      logs: logs.map(l => ({
        id: l.id,
        locationId: l.locationId,
        locationName: l.location.name,
        action: l.action,
        targetUnitId: l.targetUnitId,
        targetBarcode: l.targetUnit?.barcodes[0]?.code ?? null,
        targetItemName: l.targetUnit?.item?.name ?? null,
        previousTargetUnitId: l.previousTargetUnitId,
        previousBarcode: l.previousTargetUnit?.barcodes[0]?.code ?? null,
        previousItemName: l.previousTargetUnit?.item?.name ?? null,
        changedAt: l.changedAt.toISOString(),
        changedBy: l.changedBy?.name ?? null,
        note: l.note,
      })),
    });
  } catch (error) {
    console.error("GET /api/chamber-slots/history error:", error);
    return NextResponse.json({ error: "이력 조회 실패" }, { status: 500 });
  }
}
