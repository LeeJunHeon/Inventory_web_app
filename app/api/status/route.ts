import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "";

    const where: any = {};
    if (category && category !== "전체") {
      where.category = { name: category };
    }

    const items = await prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: { code: "asc" },
    });

    if (items.length === 0) return NextResponse.json([]);

    const itemIds = items.map((item) => item.id);

    // 배치 쿼리: 품목별 입고 합계
    const inSums = await prisma.inventoryTx.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, txType: "입고" },
      _sum: { qty: true },
    });

    // 배치 쿼리: 품목별 출고+불출 합계
    const outSums = await prisma.inventoryTx.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, txType: { in: ["출고", "불출"] } },
      _sum: { qty: true },
    });

    const inMap = new Map(inSums.map((s) => [s.itemId, s._sum.qty || 0]));
    const outMap = new Map(outSums.map((s) => [s.itemId, s._sum.qty || 0]));

    const result = items.map((item) => {
      const currentQty = (inMap.get(item.id) || 0) - (outMap.get(item.id) || 0);

      return {
        id:          item.id,
        code:        item.code,
        name:        item.name,
        category:    item.category.name,
        currentQty,
        requiredQty: item.minStockQty,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/status error:", error);
    return NextResponse.json({ error: "보유현황 조회 실패" }, { status: 500 });
  }
}

// PUT /api/status — 최소 재고 수량 저장 (item.minStockQty)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, quantity } = body;

    if (!itemId || quantity === undefined) {
      return NextResponse.json({ error: "itemId, quantity 필요" }, { status: 400 });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return NextResponse.json({ error: "수량은 0 이상의 숫자여야 합니다." }, { status: 400 });
    }

    const item = await prisma.item.update({
      where:  { id: Number(itemId) },
      data:   { minStockQty: qty },
      select: { id: true, minStockQty: true },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("PUT /api/status error:", error);
    return NextResponse.json({ error: "최소 재고 수량 저장 실패" }, { status: 500 });
  }
}
