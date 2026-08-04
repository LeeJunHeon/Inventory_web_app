import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const STATUS_ORDER: Record<string, number> = {
  "미사용": 0,
  "사용중": 1,
  "폐기": 2,
  "판매완료": 3,
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const raw = searchParams.get("locationId");
    const n = raw ? Number(raw) : NaN;
    const locFilter = n === 1 || n === 2 ? n : null; // 1/2 외 값·미전달이면 필터 없음

    // 유닛 분류 — 기본값 sputter(스퍼터 타겟). ald를 명시해야 캐니스터가 나온다.
    const unitCategory = searchParams.get("unitCategory") === "ald" ? "ald" : "sputter";
    const isAld = unitCategory === "ald";

    // 쿼리 1: 해당 분류의 target_unit + item + 활성 바코드 한 번에 가져오기
    const targetUnits = await prisma.targetUnit.findMany({
      where: { category: unitCategory },
      include: {
        item: { include: { targetSpec: true } },
        barcodes: { where: { isActive: "Y" }, take: 1 },
        aldCanisterSpec: true,
      },
    });

    const ids = targetUnits.map((tu) => tu.id);

    // 쿼리 2: 측정 타입 로그 전체를 한 번에 가져와서 JS에서 최신값 추출
    // (loggedAt desc 정렬 후 타겟별 첫 번째만 Map에 저장)
    const allMeasureLogs = await prisma.targetLog.findMany({
      where: {
        targetUnitId: { in: ids },
        logType: "측정",
        weight: { not: null },
      },
      include: { location: true },
      orderBy: { loggedAt: "desc" },
    });

    // 타겟별 가장 최근 측정 로그 Map (첫 번째로 등장하는 게 최신)
    const latestLogMap = new Map<number, typeof allMeasureLogs[0]>();
    for (const log of allMeasureLogs) {
      if (!latestLogMap.has(log.targetUnitId)) {
        latestLogMap.set(log.targetUnitId, log);
      }
    }

    // 쿼리 3: 입고 트랜잭션 전체를 한 번에 가져와서 JS에서 타겟별 최신값 추출
    const allInboundTxs = await prisma.inventoryTx.findMany({
      where: {
        txType: "입고",
        targetUnitId: { in: ids },
      },
      select: { targetUnitId: true, txDate: true, locationId: true },
      orderBy: { txDate: "desc" },
    });

    // 타겟별 가장 최근 입고일 Map
    const inboundDateMap = new Map<number, string>();
    const inboundLocMap = new Map<number, number>();
    for (const tx of allInboundTxs) {
      if (tx.targetUnitId && !inboundDateMap.has(tx.targetUnitId)) {
        inboundDateMap.set(
          tx.targetUnitId,
          tx.txDate.toISOString().split("T")[0]
        );
        if (tx.locationId != null) {
          inboundLocMap.set(tx.targetUnitId, tx.locationId);
        }
      }
    }

    // 3개의 Map을 합쳐서 최종 결과 조립
    let result = targetUnits.map((tu) => {
      const latestLog = latestLogMap.get(tu.id) ?? null;
      return {
        id: tu.id,
        status: tu.status,
        barcodeCode: tu.barcodes[0]?.code ?? "",
        itemCode: tu.item?.code ?? "",
        itemName: tu.item?.name ?? "",
        latestWeight: latestLog?.weight ? Number(latestLog.weight) : null,
        latestLoggedAt: latestLog?.loggedAt?.toISOString() ?? null,
        locationName: latestLog?.location?.name ?? null,
        inboundDate: inboundDateMap.get(tu.id) ?? null,
        siteLocationId: inboundLocMap.get(tu.id) ?? 1,
        purity:          tu.item?.targetSpec?.purity != null ? Number(tu.item.targetSpec.purity) : null,
        hasCopper:       tu.item?.targetSpec?.hasCopper ?? null,
        copperThickness: tu.item?.targetSpec?.copperThickness != null ? Number(tu.item.targetSpec.copperThickness) : null,
        // ALD 캐니스터 전용 필드 (sputter 응답에는 넣지 않는다)
        ...(isAld ? {
          materialName:       tu.aldCanisterSpec?.materialName ?? null,
          tareWeight:         tu.aldCanisterSpec?.tareWeight != null
            ? Number(tu.aldCanisterSpec.tareWeight) : null,
          initialGrossWeight: tu.aldCanisterSpec?.initialGrossWeight != null
            ? Number(tu.aldCanisterSpec.initialGrossWeight) : null,
        } : {}),
      };
    });

    if (locFilter) {
      result = result.filter((r) => r.siteLocationId === locFilter);
    }

    result.sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99;
      const sb = STATUS_ORDER[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return a.id - b.id;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/targets/status error:", error);
    return NextResponse.json(
      { error: "타겟 상태 조회 실패" },
      { status: 500 }
    );
  }
}
