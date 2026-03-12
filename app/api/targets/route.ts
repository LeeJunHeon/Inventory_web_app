import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/targets?barcode=T-0187 — 바코드로 타겟 조회 또는 전체 로그
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode") || "";

    // 바코드 지정 시: 해당 타겟 정보 + 로그
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

      const logs = await prisma.targetLog.findMany({
        where: { targetUnitId: bc.targetUnit.id },
        orderBy: { createdAt: "desc" },
      });

      const users = await prisma.user.findMany({ select: { id: true, name: true } });
      const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

      return NextResponse.json({
        target: {
          id: bc.targetUnit.id,
          barcodeCode: bc.code,
          itemCode: bc.item?.code || "",
          itemName: bc.item?.name || "",
          materialName: bc.targetUnit.materialName || "",
          status: bc.targetUnit.status,
          memo: "", // 별도 메모 필드 필요시 추가
        },
        logs: logs.map((l) => ({
          id: l.id,
          targetId: l.targetUnitId,
          timestamp: l.createdAt.toISOString().replace("T", " ").slice(0, 16),
          type: l.type,
          weight: l.weight ? Number(l.weight) : null,
          location: l.location || "",
          reason: l.reason || "",
          userName: l.userId ? userMap[l.userId] || "" : "",
          barcodeCode: bc.code,
          itemName: bc.item?.name || "",
        })),
      });
    }

    // 바코드 미지정: 전체 타겟 로그
    const logs = await prisma.targetLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        targetUnit: {
          include: {
            barcodes: { take: 1 },
            item: true,
          },
        },
      },
    });

    const users = await prisma.user.findMany({ select: { id: true, name: true } });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

    return NextResponse.json({
      target: null,
      logs: logs.map((l) => ({
        id: l.id,
        targetId: l.targetUnitId,
        timestamp: l.createdAt.toISOString().replace("T", " ").slice(0, 16),
        type: l.type,
        weight: l.weight ? Number(l.weight) : null,
        location: l.location || "",
        reason: l.reason || "",
        userName: l.userId ? userMap[l.userId] || "" : "",
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
        type: body.type || "측정",
        weight: body.weight || null,
        location: body.location || null,
        reason: body.reason || null,
        userId: body.userId || null,
      },
    });

    // 폐기 처리인 경우 타겟 상태 변경 + 바코드 비활성화
    if (body.type === "폐기") {
      await prisma.targetUnit.update({
        where: { id: body.targetUnitId },
        data: { status: "disposed" },
      });
      await prisma.barcode.updateMany({
        where: { targetUnitId: body.targetUnitId },
        data: { isActive: false },
      });
    }

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("POST /api/targets error:", error);
    return NextResponse.json({ error: "측정값 저장 실패" }, { status: 500 });
  }
}
