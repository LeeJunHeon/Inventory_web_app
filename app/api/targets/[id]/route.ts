import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT /api/targets/[id] — 타겟 상태 변경 및 물질명 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    const body = await request.json();
    const { status, materialName, purity, hasCopper } = body;

    const target = await prisma.targetUnit.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "타겟을 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.targetUnit.update({
      where: { id },
      data: {
        ...(status       !== undefined && { status }),
        ...(materialName !== undefined && { materialName }),
        ...(purity       !== undefined && { purity }),
        ...(hasCopper    !== undefined && { hasCopper }),
      },
    });

    // 폐기 처리 시 연결된 바코드 비활성화
    if (status === "disposed") {
      await prisma.barcode.updateMany({
        where: { targetUnitId: id },
        data:  { isActive: false },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/targets/[id] error:", error);
    return NextResponse.json({ error: "타겟 상태 변경 실패" }, { status: 500 });
  }
}
