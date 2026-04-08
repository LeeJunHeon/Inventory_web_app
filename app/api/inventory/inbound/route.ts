import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/inventory/inbound?itemId={id} — 입고 건별 잔여수량 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const itemIdParam = searchParams.get("itemId");
    const locationIdParam = searchParams.get("locationId");

    if (!itemIdParam || isNaN(Number(itemIdParam))) {
      return NextResponse.json({ error: "itemId가 필요합니다." }, { status: 400 });
    }
    const itemId = Number(itemIdParam);

    // 입고 트랜잭션 조회 (txNo 있는 것만)
    const inbounds = await prisma.inventoryTx.findMany({
      where: {
        txType: "입고", itemId, txNo: { not: null },
        // locationId가 있으면 해당 위치 입고건만 조회
        ...(locationIdParam ? { locationId: Number(locationIdParam) } : {}),
      },
      include: { partner: true, location: true, item: true, barcode: true },
      orderBy: { id: "desc" },
    });

    // 출고/불출에서 각 입고 txNo별 소모량 합산
    const consumed = await prisma.inventoryTx.groupBy({
      by: ["refTxNo"],
      where: {
        txType: { in: ["출고", "불출"] },
        refTxNo: { not: null },
        itemId,
      },
      _sum: { qty: true },
    });

    const consumedMap = new Map<string, number>();
    for (const c of consumed) {
      if (c.refTxNo) consumedMap.set(c.refTxNo, c._sum.qty ?? 0);
    }

    const result = inbounds
      .filter(tx => tx.txNo !== null)
      .map(tx => {
        const usedQty = consumedMap.get(tx.txNo!) ?? 0;
        const remainQty = tx.qty - usedQty;
        return {
          txNo:         tx.txNo!,
          txDate:       tx.txDate.toISOString().split("T")[0].replace(/-/g, "."),
          qty:          tx.qty,
          remainQty,
          unitPrice:    tx.unitPrice != null ? Number(tx.unitPrice) : null,
          currency:     tx.currency ?? "KRW",
          partnerName:  tx.partner?.name  ?? "",
          locationName: tx.location?.name ?? "",
          memo:         tx.memo           ?? "",
          barcodeId:    tx.barcodeId      ?? null,
          targetUnitId: tx.targetUnitId   ?? null,
          itemCode:      tx.item?.code     ?? "",
          itemName:      tx.item?.name     ?? "",
          barcodeCode:   tx.barcode?.code  ?? "",
        };
      })
      .filter(tx => tx.remainQty > 0);

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/inventory/inbound error:", error);
    return NextResponse.json({ error: "입고 이력 조회 실패" }, { status: 500 });
  }
}
