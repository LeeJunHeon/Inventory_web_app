import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/chamber-slots/history?locationId={id}&limit=100
// GET /api/chamber-slots/history?targetUnitId={id}&limit=100
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locationIdParam = searchParams.get("locationId");
    const targetUnitIdParam = searchParams.get("targetUnitId");
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "50", 10)));

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

    const logs = await prisma.chamberSlotLog.findMany({
      where,
      include: {
        location: true,
        targetUnit: { include: { item: true, barcodes: { take: 1 } } },
        previousTargetUnit: { include: { item: true, barcodes: { take: 1 } } },
        changedBy: { select: { id: true, name: true } },
      },
      orderBy: { changedAt: "desc" },
      take: limit,
    });

    return NextResponse.json(
      logs.map(l => ({
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
      }))
    );
  } catch (error) {
    console.error("GET /api/chamber-slots/history error:", error);
    return NextResponse.json({ error: "이력 조회 실패" }, { status: 500 });
  }
}
