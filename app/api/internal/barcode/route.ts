import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expandBarcodeVariants } from "@/lib/barcodeUtils";
import { requireInternalAuth } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

// GET /api/internal/barcode?code=
// 기존 app/api/barcodes/lookup GET 로직 재사용
//   - expandBarcodeVariants로 variant 매칭
//   - 비활성 바코드 차단 (isActive === "N")
//   - 가장 최근 입고 txNo를 refTxNo로
export async function GET(request: NextRequest) {
  const authResult = await requireInternalAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const code = new URL(request.url).searchParams.get("code");
    if (!code) {
      return NextResponse.json({ error: "code 파라미터가 필요합니다." }, { status: 400 });
    }

    const variants = expandBarcodeVariants(code);
    const barcode = await prisma.barcode.findFirst({
      where: {
        OR: variants.map(v => ({ code: { equals: v, mode: "insensitive" as const } })),
      },
      include: {
        item: { include: { category: true } },
        targetUnit: { include: { item: { include: { category: true } } } },
      },
    });

    if (!barcode) {
      return NextResponse.json({ error: "바코드를 찾을 수 없습니다." }, { status: 404 });
    }

    if (barcode.isActive === "N") {
      return NextResponse.json(
        { error: "비활성화된 바코드입니다. 폐기 처리된 타겟이거나 사용 중지된 바코드입니다." },
        { status: 400 }
      );
    }

    const item = barcode.item ?? barcode.targetUnit?.item ?? null;

    const lastInbound = await prisma.inventoryTx.findFirst({
      where: { barcodeId: barcode.id, txType: "입고" },
      orderBy: { id: "desc" },
      select: { txNo: true },
    });

    return NextResponse.json({
      barcodeId:    barcode.id,
      itemId:       item?.id       ?? null,
      itemCode:     item?.code     ?? "",
      itemName:     item?.name     ?? "",
      category:     item?.category?.name ?? "",
      targetUnitId: barcode.targetUnitId ?? null,
      refTxNo:      lastInbound?.txNo ?? null,
    });
  } catch (error) {
    console.error("GET /api/internal/barcode error:", error);
    return NextResponse.json({ error: "바코드 조회 실패" }, { status: 500 });
  }
}
