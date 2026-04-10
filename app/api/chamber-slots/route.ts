import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

// GET /api/chamber-slots — 챔버 슬롯 전체 조회
export async function GET() {
  try {
    const slots = await prisma.chamberSlot.findMany({
      include: {
        location: true,
        targetUnit: {
          include: {
            item: { include: { targetSpec: true } },
            barcodes: { take: 1 },
            targetLogs: {
              where: {
                logType: { in: ["측정", "measure"] },
                weight: { not: null },
              },
              orderBy: { loggedAt: "desc" },
              take: 1,
            },
          },
        },
        updatedBy: { select: { id: true, name: true } },
      },
      orderBy: { locationId: "asc" },
    });

    return NextResponse.json(
      slots.map(s => ({
        id: s.id,
        locationId: s.locationId,
        locationName: s.location.name,
        targetUnitId: s.targetUnitId ?? null,
        barcodeCode: s.targetUnit?.barcodes[0]?.code ?? null,
        itemName: s.targetUnit?.item?.name ?? null,
        itemCode: s.targetUnit?.item?.code ?? null,
        materialCode: s.targetUnit?.item?.targetSpec?.materialCode ?? null,
        latestWeight: s.targetUnit?.targetLogs[0]?.weight
          ? Number(s.targetUnit.targetLogs[0].weight)
          : null,
        latestLoggedAt: s.targetUnit?.targetLogs[0]?.loggedAt ?? null,
        loadedAt: s.loadedAt ?? null,
        updatedBy: s.updatedBy?.name ?? null,
        note: s.note ?? null,
      }))
    );
  } catch (error) {
    console.error("GET /api/chamber-slots error:", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// PUT /api/chamber-slots — 슬롯 수정 (타겟 교체/제거)
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    const body = await request.json();
    const { id, targetUnitId, note } = body;

    const slot = await prisma.chamberSlot.update({
      where: { id: Number(id) },
      data: {
        targetUnitId: targetUnitId ?? null,
        loadedAt: targetUnitId ? new Date() : null,
        updatedById: user?.id ?? null,
        note: note ?? null,
      },
    });

    return NextResponse.json(slot);
  } catch (error) {
    console.error("PUT /api/chamber-slots error:", error);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}
