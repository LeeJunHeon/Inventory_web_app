import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// GET /api/inventory/using-lots?itemId={id}&locationId={id}
// 해당 품목의 '사용중' 전표 중 아직 폐기되지 않은 잔여가 있는 건만 반환.
//   remainQty = 사용중.qty - sum(그 사용중을 참조한 폐기 qty)
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const itemIdParam     = searchParams.get("itemId");
    const locationIdParam = searchParams.get("locationId");

    if (!itemIdParam || isNaN(Number(itemIdParam))) {
      return NextResponse.json({ error: "itemId가 필요합니다." }, { status: 400 });
    }
    const itemId = Number(itemIdParam);

    const usings = await prisma.inventoryTx.findMany({
      where: {
        txType: "사용중",
        itemId,
        txNo: { not: null },
        ...(locationIdParam ? { locationId: Number(locationIdParam) } : {}),
      },
      include: { location: true, barcode: true },
      orderBy: { id: "desc" },
    });

    if (usings.length === 0) return NextResponse.json([]);

    // 각 사용중 전표를 참조한 폐기 합계
    const disposed = await prisma.inventoryTx.groupBy({
      by: ["refTxNo"],
      where: {
        txType: "폐기",
        refTxNo: { in: usings.map(u => u.txNo!).filter(Boolean) },
      },
      _sum: { qty: true },
    });

    const disposedMap = new Map<string, number>();
    for (const d of disposed) {
      if (d.refTxNo) disposedMap.set(d.refTxNo, d._sum.qty ?? 0);
    }

    const result = usings
      .map(tx => ({
        txNo:         tx.txNo!,
        txDate:       tx.txDate.toISOString().split("T")[0].replace(/-/g, "."),
        qty:          tx.qty,
        remainQty:    tx.qty - (disposedMap.get(tx.txNo!) ?? 0),
        locationId:   tx.locationId,
        locationName: tx.location?.name ?? "",
        barcodeCode:  tx.barcode?.code  ?? "",
      }))
      .filter(tx => tx.remainQty > 0);

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/inventory/using-lots error:", error);
    return NextResponse.json({ error: "사용중 건 조회 실패" }, { status: 500 });
  }
}
