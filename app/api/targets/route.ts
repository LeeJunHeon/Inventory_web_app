import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/targets?barcode=T-0187&page=1&limit=50
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode") || "";
    const page    = Math.max(1, parseInt(searchParams.get("page")  || "1", 10));
    const limit   = Math.max(1, parseInt(searchParams.get("limit") || "50", 10));
    const skip    = (page - 1) * limit;

    // 바코드 지정 시: 해당 타겟 정보 + 로그 (페이지네이션 적용)
    if (barcode) {
      const bc = await prisma.barcode.findFirst({
        where: { code: { equals: barcode, mode: "insensitive" } },
        include: {
          item: { include: { category: true } },
          targetUnit: true,
        },
      });

      if (!bc || !bc.targetUnit) {
        return NextResponse.json({ error: "타겟을 찾을 수 없습니다" }, { status: 404 });
      }

      const where = { targetUnitId: bc.targetUnit.id };
      const [total, logs] = await Promise.all([
        prisma.targetLog.count({ where }),
        prisma.targetLog.findMany({
          where,
          include: { location: true, user: true },
          orderBy: { loggedAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return NextResponse.json({
        total, page, limit,
        target: {
          id: bc.targetUnit.id,
          barcodeCode: bc.code,
          itemCode: bc.item?.code || "",
          itemName: bc.item?.name || "",
          status: bc.targetUnit.status,
          note: bc.targetUnit.note || "",
        },
        logs: logs.map((l) => ({
          id: l.id,
          targetId: l.targetUnitId,
          timestamp: l.loggedAt.toISOString().replace("T", " ").slice(0, 16),
          type: l.logType,
          weight: l.weight ? Number(l.weight) : null,
          location: l.location?.name || "",
          locationId: l.locationId ?? null,
          reason: l.reason || "",
          userName: l.user?.name || "",
          barcodeCode: bc.code,
          itemName: bc.item?.name || "",
        })),
      });
    }

    // 바코드 미지정: 전체 타겟 로그 (페이지네이션 적용)
    const [total, logs] = await Promise.all([
      prisma.targetLog.count(),
      prisma.targetLog.findMany({
        orderBy: { loggedAt: "desc" },
        skip,
        take: limit,
        include: {
          location: true,
          user: true,
          targetUnit: {
            include: {
              barcodes: { take: 1 },
              item: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      total, page, limit,
      target: null,
      logs: logs.map((l) => ({
        id: l.id,
        targetId: l.targetUnitId,
        timestamp: l.loggedAt.toISOString().replace("T", " ").slice(0, 16),
        type: l.logType,
        weight: l.weight ? Number(l.weight) : null,
        location: l.location?.name || "",
        locationId: l.locationId ?? null,
        reason: l.reason || "",
        userName: l.user?.name || "",
        barcodeCode: l.targetUnit.barcodes[0]?.code || "",
        itemName: l.targetUnit.item?.name || "",
      })),
    });
  } catch (error) {
    console.error("GET /api/targets error:", error);
    return NextResponse.json({ error: "타겟 조회 실패" }, { status: 500 });
  }
}

// POST /api/targets — 측정값 저장
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const log = await prisma.targetLog.create({
      data: {
        targetUnitId: body.targetUnitId,
        logType:      body.logType || body.type || "측정",
        weight:       body.weight     || null,
        locationId:   body.locationId || null,
        reason:       body.reason     || null,
        userId:       body.userId     || null,
      },
    });

    // 폐기 처리인 경우 타겟 상태 변경 + 바코드 비활성화
    const isDispose = body.logType === "폐기" || body.type === "폐기"
      || body.logType === "dispose";
    if (isDispose) {
      await prisma.targetUnit.update({
        where: { id: body.targetUnitId },
        data: { status: "disposed", disposedAt: new Date() },
      });
      await prisma.barcode.updateMany({
        where: { targetUnitId: body.targetUnitId },
        data: { isActive: "N" },
      });
    }

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("POST /api/targets error:", error);
    return NextResponse.json({ error: "측정값 저장 실패" }, { status: 500 });
  }
}
