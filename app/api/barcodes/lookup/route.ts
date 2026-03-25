import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/barcodes/lookup?code={바코드코드}
// 바코드로 품목 정보 + 가장 최근 입고 tx_no 반환 (출고/불출 시 ref_tx_no 자동 연결용)
export async function GET(request: NextRequest) {
  try {
    const code = new URL(request.url).searchParams.get("code");
    if (!code) {
      return NextResponse.json({ error: "code 파라미터가 필요합니다." }, { status: 400 });
    }

    const barcode = await prisma.barcode.findFirst({
      where: { code },
      include: {
        item: { include: { category: true } },
        targetUnit: { include: { item: { include: { category: true } } } },
      },
    });

    if (!barcode) {
      return NextResponse.json({ error: "바코드를 찾을 수 없습니다." }, { status: 404 });
    }

    // 비활성 바코드 차단 (출고/불출 방지)
    if (barcode.isActive === "N") {
      return NextResponse.json(
        { error: "비활성화된 바코드입니다. 폐기 처리된 타겟이거나 사용 중지된 바코드입니다." },
        { status: 400 }
      );
    }

    const item = barcode.item ?? barcode.targetUnit?.item ?? null;

    // 해당 바코드의 가장 최근 입고 트랜잭션 조회
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
    console.error("GET /api/barcodes/lookup error:", error);
    return NextResponse.json({ error: "바코드 조회 실패" }, { status: 500 });
  }
}
