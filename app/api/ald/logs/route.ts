import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUserId, logActivity } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// GET /api/ald/logs?canisterId=1&page=1&limit=50
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const canisterId = Number(searchParams.get("canisterId") || "0");
    const page       = Math.max(1, Number(searchParams.get("page")  || "1"));
    const limit      = Math.max(1, Number(searchParams.get("limit") || "50"));
    const skip       = (page - 1) * limit;

    if (!canisterId) {
      return NextResponse.json({ error: "canisterId가 필요합니다." }, { status: 400 });
    }

    const [total, logs] = await Promise.all([
      prisma.targetLog.count({ where: { targetUnitId: canisterId } }),
      prisma.targetLog.findMany({
        where:   { targetUnitId: canisterId },
        orderBy: { loggedAt: "desc" },
        skip,
        take:    limit,
        include: {
          aldLogDetail: true,
          location:     true,
          user:         true,
        },
      }),
    ]);

    return NextResponse.json({
      total, page, limit,
      logs: logs.map(l => ({
        id:                    l.id,
        canisterId:            l.targetUnitId,
        timestamp:             l.loggedAt.toISOString().replace("T", " ").slice(0, 16),
        logSubType:            l.aldLogDetail?.logSubType || l.logType,
        materialName:          l.aldLogDetail?.materialName || "",
        grossWeight:           l.aldLogDetail?.grossWeight    ? Number(l.aldLogDetail.grossWeight)           : null,
        tareWeight:            l.aldLogDetail?.tareWeight     ? Number(l.aldLogDetail.tareWeight)            : null,
        measureWeight:         l.aldLogDetail?.measureWeight  ? Number(l.aldLogDetail.measureWeight)         : null,
        cumulativeCycle:       l.aldLogDetail?.cumulativeCycle    ?? null,
        consumptionPerCycle:   l.aldLogDetail?.consumptionPerCycle
                                 ? Number(l.aldLogDetail.consumptionPerCycle) : null,
        remainPercent:         l.aldLogDetail?.remainPercent
                                 ? Number(l.aldLogDetail.remainPercent)      : null,
        estimatedRemainCycle:  l.aldLogDetail?.estimatedRemainCycle ?? null,
        location:              l.location?.name || "",
        reason:                l.reason || "",
        userName:              l.user?.name || "",
      })),
    });
  } catch (error) {
    console.error("GET /api/ald/logs error:", error);
    return NextResponse.json({ error: "로그 조회 실패" }, { status: 500 });
  }
}

// POST /api/ald/logs — 측정/충진 기록 저장
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const body = await request.json();
    const {
      canisterId,
      logSubType,      // "측정" | "충진"
      materialName,
      locationId,
      cumulativeCycle,
      reason,
    } = body;
    const slotId = body.slotId ? Number(body.slotId) : null;

    if (!canisterId || body.measureWeight == null) {
      return NextResponse.json({ error: "canisterId, measureWeight는 필수입니다." }, { status: 400 });
    }

    // Canister spec 조회 (tare, initialGross)
    const spec = await prisma.aldCanisterSpec.findUnique({
      where: { targetUnitId: Number(canisterId) },
    });
    if (!spec) {
      return NextResponse.json({ error: "Canister 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const measure     = Number(body.measureWeight);
    const tare        = Number(spec.tareWeight);
    const initialPure = spec.initialGrossWeight
                          ? Number(spec.initialGrossWeight) - tare
                          : measure; // 최초 충진이면 measure가 기준

    const curCycle = cumulativeCycle ? Number(cumulativeCycle) : null;

    const remainPercent = initialPure > 0
      ? (measure / initialPure) * 100 : null;

    const estimatedRemainCycle = (curCycle && measure > 0 && initialPure > measure)
      ? Math.round(measure * curCycle / (initialPure - measure)) : null;

    const sessionUserId = await getSessionUserId();

    const saved = await prisma.$transaction(async (tx) => {
      // target_log 저장 (공통)
      const log = await tx.targetLog.create({
        data: {
          targetUnitId: Number(canisterId),
          logType:      "측정",
          weight:       measure,
          locationId:   locationId ? Number(locationId) : null,
          reason:       reason || null,
          userId:       sessionUserId ?? null,
        },
      });

      // ald_log_detail 저장
      await tx.aldLogDetail.create({
        data: {
          targetLogId:          log.id,
          logSubType:           "측정",
          materialName:         materialName || spec.materialName || null,
          grossWeight:          spec.initialGrossWeight
            ? Number(spec.initialGrossWeight) : null,
          tareWeight:           tare,
          measureWeight:        measure,
          cumulativeCycle:      curCycle,
          consumptionPerCycle:  body.consumptionPerCycle
            ? Number(body.consumptionPerCycle) : null,
          remainPercent:        remainPercent,
          estimatedRemainCycle: estimatedRemainCycle,
          locationId:           locationId ? Number(locationId) : null,
        },
      });

      // slotId가 있으면 해당 포트에 canister 자동 배정
      if (slotId) {
        // 기존에 이 canister가 배정된 다른 슬롯 비우기
        await tx.aldPortSlot.updateMany({
          where: {
            targetUnitId: Number(canisterId),
            id: { not: slotId },
          },
          data: {
            targetUnitId: null,
            loadedAt:     null,
          },
        });

        // 선택한 슬롯에 canister 배정
        await tx.aldPortSlot.update({
          where: { id: slotId },
          data: {
            targetUnitId: Number(canisterId),
            loadedAt:     new Date(),
          },
        });
      }

      // ald_port_slot 위치 자동 업데이트 (locationId가 포트 위치면)
      if (locationId) {
        await tx.aldPortSlot.updateMany({
          where: { targetUnitId: Number(canisterId) },
          data:  { loadedAt: new Date() },
        });
      }

      return log;
    });

    await logActivity(sessionUserId, "CREATE", "target_log", saved.id,
      `ALD ${logSubType || "측정"}: measure=${measure.toFixed(3)}g`);

    return NextResponse.json({ id: saved.id, message: "저장되었습니다." }, { status: 201 });
  } catch (error) {
    console.error("POST /api/ald/logs error:", error);
    return NextResponse.json({ error: "저장 실패", detail: String(error) }, { status: 500 });
  }
}
