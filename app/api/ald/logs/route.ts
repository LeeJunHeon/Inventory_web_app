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
        cycleDelta:            l.aldLogDetail?.cycleDelta         ?? null,
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
      grossWeight,
      locationId,
      cumulativeCycle,
      reason,
    } = body;

    if (!canisterId || !grossWeight) {
      return NextResponse.json({ error: "canisterId, grossWeight는 필수입니다." }, { status: 400 });
    }

    // Canister spec 조회 (tare, initialGross)
    const spec = await prisma.aldCanisterSpec.findUnique({
      where: { targetUnitId: Number(canisterId) },
    });
    if (!spec) {
      return NextResponse.json({ error: "Canister 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const tare         = Number(spec.tareWeight);
    const gross        = Number(grossWeight);
    const measure      = gross - tare;
    const initialPure  = spec.initialGrossWeight
                           ? Number(spec.initialGrossWeight) - tare
                           : measure; // 최초 충진이면 measure가 기준

    // 이전 로그 조회 (소모량, cycle delta 계산용)
    const prevLog = await prisma.targetLog.findFirst({
      where:   { targetUnitId: Number(canisterId) },
      orderBy: { loggedAt: "desc" },
      include: { aldLogDetail: true },
    });

    // 계산
    const prevMeasure = prevLog?.aldLogDetail?.measureWeight
                          ? Number(prevLog.aldLogDetail.measureWeight) : null;
    const prevCycle   = prevLog?.aldLogDetail?.cumulativeCycle ?? null;
    const curCycle    = cumulativeCycle ? Number(cumulativeCycle) : null;

    const cycleDelta = (curCycle != null && prevCycle != null)
      ? curCycle - prevCycle : null;

    const consumptionPerCycle = (cycleDelta && cycleDelta > 0 && prevMeasure != null)
      ? (prevMeasure - measure) / cycleDelta : null;

    const remainPercent = initialPure > 0
      ? (measure / initialPure) * 100 : null;

    const estimatedRemainCycle = (curCycle && measure > 0 && initialPure > measure)
      ? Math.round(measure * curCycle / (initialPure - measure)) : null;

    // 충진이면 이전보다 measure가 높아도 OK, 측정이면 체크
    if (logSubType === "측정" && prevMeasure != null && measure > prevMeasure) {
      return NextResponse.json(
        { error: "이전 측정값보다 높습니다. 충진이면 구분을 '충진'으로 변경하세요." },
        { status: 400 }
      );
    }

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
          logSubType:           logSubType || "측정",
          materialName:         materialName || spec.materialName || null,
          grossWeight:          gross,
          tareWeight:           tare,
          measureWeight:        measure,
          cumulativeCycle:      curCycle,
          cycleDelta:           cycleDelta,
          consumptionPerCycle:  consumptionPerCycle,
          remainPercent:        remainPercent,
          estimatedRemainCycle: estimatedRemainCycle,
          locationId:           locationId ? Number(locationId) : null,
        },
      });

      // 충진이면 spec 업데이트 (기준점 리셋 + 물질명 갱신)
      if (logSubType === "충진") {
        await tx.aldCanisterSpec.update({
          where: { targetUnitId: Number(canisterId) },
          data: {
            initialGrossWeight: gross,
            materialName:       materialName || spec.materialName,
            updatedAt:          new Date(),
          },
        });
        // 상태 → 사용중
        await tx.targetUnit.update({
          where: { id: Number(canisterId) },
          data:  { status: "사용중" },
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
      `ALD ${logSubType || "측정"}: gross=${gross}g, measure=${measure.toFixed(3)}g`);

    return NextResponse.json({ id: saved.id, message: "저장되었습니다." }, { status: 201 });
  } catch (error) {
    console.error("POST /api/ald/logs error:", error);
    return NextResponse.json({ error: "저장 실패", detail: String(error) }, { status: 500 });
  }
}
