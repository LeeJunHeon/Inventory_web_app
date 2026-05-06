import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expandBarcodeVariants } from "@/lib/barcodeUtils";

export const dynamic = "force-dynamic";

interface MovementSegment {
  locationId: number | null;
  locationName: string;
  enteredAt: string;        // ISO
  leftAt: string | null;    // ISO, null이면 현재 위치
  measurementCount: number;
  firstWeight: number | null;
  lastWeight: number | null;
}

// GET /api/targets/movements?barcode={바코드코드}
// 또는    /api/targets/movements?targetUnitId={id}
// 해당 타겟의 위치 이동 segment 배열 반환 (측정 로그 기반)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode") || "";
    const targetUnitIdParam = searchParams.get("targetUnitId");

    let targetUnitId: number | null = null;
    let resolvedBarcode = "";
    let bcItem: { id: number; code: string; name: string } | null = null;
    let tuStatus = "";

    if (targetUnitIdParam) {
      targetUnitId = Number(targetUnitIdParam);
      const tu = await prisma.targetUnit.findUnique({
        where: { id: targetUnitId },
        include: {
          item: true,
          barcodes: { take: 1 },
        },
      });
      if (!tu) {
        return NextResponse.json({ error: "타겟을 찾을 수 없습니다" }, { status: 404 });
      }
      resolvedBarcode = tu.barcodes[0]?.code ?? "";
      bcItem = tu.item ? { id: tu.item.id, code: tu.item.code, name: tu.item.name } : null;
      tuStatus = tu.status;
    } else if (barcode) {
      const variants = expandBarcodeVariants(barcode);
      const bc = await prisma.barcode.findFirst({
        where: {
          OR: variants.map(v => ({ code: { equals: v, mode: "insensitive" as const } })),
        },
        include: {
          item: true,
          targetUnit: { include: { item: true } },
        },
      });
      if (!bc || !bc.targetUnit) {
        return NextResponse.json({ error: "타겟을 찾을 수 없습니다" }, { status: 404 });
      }
      targetUnitId = bc.targetUnit.id;
      resolvedBarcode = bc.code;
      const item = bc.item ?? bc.targetUnit.item ?? null;
      bcItem = item ? { id: item.id, code: item.code, name: item.name } : null;
      tuStatus = bc.targetUnit.status;
    } else {
      return NextResponse.json({ error: "barcode 또는 targetUnitId가 필요합니다." }, { status: 400 });
    }

    // 해당 타겟의 모든 로그 (시간 ASC)
    const logs = await prisma.targetLog.findMany({
      where: { targetUnitId: targetUnitId! },
      include: { location: true },
      orderBy: { loggedAt: "asc" },
    });

    // 측정 + locationId 있는 것만 segment 압축
    const measureLogs = logs.filter(l => l.logType === "측정" && l.locationId != null);
    const unknownLocationCount = logs.filter(l => l.logType === "측정" && l.locationId == null).length;

    const segments: MovementSegment[] = [];
    let curr: MovementSegment | null = null;

    for (const log of measureLogs) {
      const w = log.weight != null ? Number(log.weight) : null;
      if (!curr || curr.locationId !== log.locationId) {
        // 새 segment 시작 → 직전 segment의 leftAt을 이 시점으로
        if (curr) {
          curr.leftAt = log.loggedAt.toISOString();
          segments.push(curr);
        }
        curr = {
          locationId: log.locationId,
          locationName: log.location?.name ?? "",
          enteredAt: log.loggedAt.toISOString(),
          leftAt: null,
          measurementCount: 1,
          firstWeight: w,
          lastWeight: w,
        };
      } else {
        // 같은 위치 연속 측정 → count 증가, lastWeight 갱신
        curr.measurementCount++;
        if (w != null) curr.lastWeight = w;
      }
    }
    if (curr) segments.push(curr);

    // 폐기 로그 처리: 마지막 segment의 leftAt 채우기 + isDisposed 플래그
    const disposeLog = [...logs].reverse().find(l => l.logType === "폐기");
    const isDisposed = !!disposeLog;
    if (isDisposed && segments.length > 0 && segments[segments.length - 1].leftAt == null) {
      segments[segments.length - 1].leftAt = disposeLog!.loggedAt.toISOString();
    }

    // 최신순 정렬: ASC로 압축된 segments를 reverse하여 가장 최근 위치가 첫 번째로 오도록
    segments.reverse();

    return NextResponse.json({
      target: {
        id: targetUnitId,
        barcodeCode: resolvedBarcode,
        itemCode: bcItem?.code ?? "",
        itemName: bcItem?.name ?? "",
        status: tuStatus,
      },
      segments,
      unknownLocationCount,
      isDisposed,
      disposedAt: disposeLog?.loggedAt.toISOString() ?? null,
    });
  } catch (error) {
    console.error("GET /api/targets/movements error:", error);
    return NextResponse.json({ error: "이동 내역 조회 실패" }, { status: 500 });
  }
}
