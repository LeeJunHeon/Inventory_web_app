import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUserId, logActivity } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// GET /api/ald/port-slots
// 전체 포트 현황 반환 (장착된 Canister 정보 포함)
export async function GET() {
  try {
    const slots = await prisma.aldPortSlot.findMany({
      orderBy: [{ equipmentName: "asc" }, { portNumber: "asc" }],
      include: {
        targetUnit: {
          include: {
            barcodes:        { where: { isActive: "Y" }, take: 1 },
            aldCanisterSpec: true,
            targetLogs: {
              orderBy: { loggedAt: "desc" },
              take: 1,
              include: { aldLogDetail: true },
            },
          },
        },
      },
    });

    return NextResponse.json(slots.map(slot => {
      const tu       = slot.targetUnit;
      const spec     = tu?.aldCanisterSpec;
      const lastLog  = tu?.targetLogs[0];
      const lastDetail = lastLog?.aldLogDetail;

      return {
        id:            slot.id,
        equipmentName: slot.equipmentName,
        portNumber:    slot.portNumber,
        canisterId:    tu?.id ?? null,
        canisterCode:  tu?.barcodes[0]?.code ?? null,
        materialName:  spec?.materialName ?? null,
        remainPercent: lastDetail?.remainPercent
                         ? Number(lastDetail.remainPercent) : null,
        loadedAt:      slot.loadedAt?.toISOString() ?? null,
        note:          slot.note ?? null,
      };
    }));
  } catch (error) {
    console.error("GET /api/ald/port-slots error:", error);
    return NextResponse.json({ error: "포트 현황 조회 실패" }, { status: 500 });
  }
}

// PUT /api/ald/port-slots
// { slotId, canisterId }        → 포트에 Canister 배정 (canisterId=null이면 비우기)
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const body = await request.json();
    const { slotId, canisterId } = body;

    if (!slotId) {
      return NextResponse.json({ error: "slotId가 필요합니다." }, { status: 400 });
    }

    const sessionUserId = await getSessionUserId();

    // 같은 Canister가 다른 포트에 있으면 먼저 비우기
    if (canisterId) {
      await prisma.aldPortSlot.updateMany({
        where: { targetUnitId: Number(canisterId) },
        data:  { targetUnitId: null, loadedAt: null },
      });
    }

    const updated = await prisma.aldPortSlot.update({
      where: { id: Number(slotId) },
      data: {
        targetUnitId:  canisterId ? Number(canisterId) : null,
        loadedAt:      canisterId ? new Date() : null,
        updatedById:   sessionUserId ?? null,
      },
    });

    // Canister 상태 → 사용중 (배정 시)
    if (canisterId) {
      await prisma.targetUnit.update({
        where: { id: Number(canisterId) },
        data:  { status: "사용중" },
      });
    }

    await logActivity(
      sessionUserId, "UPDATE", "chamber_slot", Number(slotId),
      canisterId
        ? `포트 배정: ${updated.equipmentName} P${updated.portNumber} → Canister ${canisterId}`
        : `포트 비우기: ${updated.equipmentName} P${updated.portNumber}`
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/ald/port-slots error:", error);
    return NextResponse.json({ error: "포트 설정 실패" }, { status: 500 });
  }
}
