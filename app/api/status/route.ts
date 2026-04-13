import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category   = searchParams.get("category")   || "";
    const locationId = searchParams.get("locationId")  || "";

    const where: any = {};
    if (category && category !== "전체") {
      where.category = { name: category };
    }

    const items = await prisma.item.findMany({
      where,
      include: {
        category: true,
        barcodes: { select: { code: true }, where: { isActive: "Y" } },
      },
      orderBy: { code: "asc" },
    });

    if (items.length === 0) return NextResponse.json([]);

    const itemIds = items.map((item) => item.id);

    // 위치 필터 (locationId 있으면 해당 위치만, 없으면 전체)
    const locationFilter = locationId ? { locationId: Number(locationId) } : {};

    // 배치 쿼리: 품목별 입고 합계
    const inSums = await prisma.inventoryTx.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, txType: "입고", ...locationFilter },
      _sum: { qty: true },
    });

    // 배치 쿼리: 품목별 출고+불출 합계
    const outSums = await prisma.inventoryTx.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, txType: { in: ["출고", "불출"] }, ...locationFilter },
      _sum: { qty: true },
    });

    const inMap = new Map(inSums.map((s) => [s.itemId, s._sum.qty || 0]));
    const outMap = new Map(outSums.map((s) => [s.itemId, s._sum.qty || 0]));

    // 전체 조회 시 본사(1), 공덕(2) 위치별 수량 별도 집계
    let loc1InMap  = new Map<number, number>();
    let loc1OutMap = new Map<number, number>();
    let loc2InMap  = new Map<number, number>();
    let loc2OutMap = new Map<number, number>();

    if (!locationId) {
      const [loc1In, loc1Out, loc2In, loc2Out] = await Promise.all([
        prisma.inventoryTx.groupBy({
          by: ["itemId"],
          where: { itemId: { in: itemIds }, txType: "입고", locationId: 1 },
          _sum: { qty: true },
        }),
        prisma.inventoryTx.groupBy({
          by: ["itemId"],
          where: { itemId: { in: itemIds }, txType: { in: ["출고", "불출"] }, locationId: 1 },
          _sum: { qty: true },
        }),
        prisma.inventoryTx.groupBy({
          by: ["itemId"],
          where: { itemId: { in: itemIds }, txType: "입고", locationId: 2 },
          _sum: { qty: true },
        }),
        prisma.inventoryTx.groupBy({
          by: ["itemId"],
          where: { itemId: { in: itemIds }, txType: { in: ["출고", "불출"] }, locationId: 2 },
          _sum: { qty: true },
        }),
      ]);
      loc1InMap  = new Map(loc1In.map(s  => [s.itemId, s._sum.qty || 0]));
      loc1OutMap = new Map(loc1Out.map(s => [s.itemId, s._sum.qty || 0]));
      loc2InMap  = new Map(loc2In.map(s  => [s.itemId, s._sum.qty || 0]));
      loc2OutMap = new Map(loc2Out.map(s => [s.itemId, s._sum.qty || 0]));
    }

    const result = items
      // 위치 필터가 있을 때: 해당 위치에 실제 거래 기록이 있는 품목만 포함
      // 위치 필터가 없을 때(전체): 모든 품목 포함
      .filter(item => !locationId || inMap.has(item.id) || outMap.has(item.id))
      .map((item) => {
        const currentQty = (inMap.get(item.id) || 0) - (outMap.get(item.id) || 0);
        return {
          id:          item.id,
          code:        item.code,
          name:        item.name,
          category:    item.category.name,
          currentQty,
          requiredQty: item.minStockQty,
          barcodes:    item.barcodes?.map(b => b.code) ?? [],
          locationQty: locationId ? undefined : {
            1: (loc1InMap.get(item.id) || 0) - (loc1OutMap.get(item.id) || 0),
            2: (loc2InMap.get(item.id) || 0) - (loc2OutMap.get(item.id) || 0),
          },
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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
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

    if (session.user.email) {
      const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (actor) await prisma.activityLog.create({
        data: { userId: actor.id, action: "UPDATE", tableName: "item", recordId: Number(itemId) },
      });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("PUT /api/status error:", error);
    return NextResponse.json({ error: "최소 재고 수량 저장 실패" }, { status: 500 });
  }
}
