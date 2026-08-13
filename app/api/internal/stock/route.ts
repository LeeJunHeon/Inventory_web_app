import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalAuth } from "@/lib/internal-auth";
import { STOCK_PLUS_TYPES, STOCK_MINUS_TYPES, getStockMinusDisposals, sumDisposalsByItem } from "@/lib/txTypes";

export const dynamic = "force-dynamic";

// GET /api/internal/stock?itemId=&locationId=
// 단일 품목 현재고 조회. status route의 계산식과 동일:
//   currentQty = sum(입고 qty) - sum(출고+불출+사용중 qty) - sum(보유차감 대상 폐기 qty)
// locationId 지정 시 해당 위치로 한정.
export async function GET(request: NextRequest) {
  const authResult = await requireInternalAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const { searchParams } = new URL(request.url);
    const itemIdParam = searchParams.get("itemId");
    const locationIdParam = searchParams.get("locationId");

    if (!itemIdParam || isNaN(Number(itemIdParam))) {
      return NextResponse.json({ error: "itemId가 필요합니다." }, { status: 400 });
    }
    const itemId = Number(itemIdParam);
    const locationFilter = locationIdParam ? { locationId: Number(locationIdParam) } : {};

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, code: true, name: true },
    });
    if (!item) {
      return NextResponse.json({ error: "품목을 찾을 수 없습니다." }, { status: 404 });
    }

    const [inSum, outSum] = await Promise.all([
      prisma.inventoryTx.aggregate({
        where: { itemId, txType: { in: STOCK_PLUS_TYPES }, ...locationFilter },
        _sum: { qty: true },
      }),
      prisma.inventoryTx.aggregate({
        where: { itemId, txType: { in: STOCK_MINUS_TYPES }, ...locationFilter },
        _sum: { qty: true },
      }),
    ]);

    const disposalQty = sumDisposalsByItem(
      await getStockMinusDisposals({
        itemIds: [itemId],
        ...(locationIdParam ? { locationId: Number(locationIdParam) } : {}),
      })
    ).get(itemId) ?? 0;

    const currentQty = (inSum._sum.qty ?? 0) - (outSum._sum.qty ?? 0) - disposalQty;

    return NextResponse.json({
      itemId:   item.id,
      itemCode: item.code,
      itemName: item.name,
      currentQty,
      ...(locationIdParam ? { locationId: Number(locationIdParam) } : {}),
    });
  } catch (error) {
    console.error("GET /api/internal/stock error:", error);
    return NextResponse.json({ error: "현재고 조회 실패" }, { status: 500 });
  }
}
