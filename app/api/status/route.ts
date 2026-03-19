import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "";

    const where: any = { isActive: true };
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
      where: { itemId: { in: itemIds }, type: "입고" },
      _sum: { quantity: true },
    });

    // 배치 쿼리: 품목별 출고+불출 합계
    const outSums = await prisma.inventoryTx.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, type: { in: ["출고", "불출"] } },
      _sum: { quantity: true },
    });

    // 배치 쿼리: 필요수량
    const requiredQtys = await prisma.requiredQty.findMany({
      where: { itemId: { in: itemIds } },
    });

    const inMap = new Map(inSums.map((s) => [s.itemId, s._sum.quantity || 0]));
    const outMap = new Map(outSums.map((s) => [s.itemId, s._sum.quantity || 0]));
    const rqMap = new Map(requiredQtys.map((rq) => [rq.itemId, rq.quantity]));

    // 웨이퍼 품목의 최신 입고 속성 (한 번에 조회)
    // distinct + orderBy는 반드시 동일 필드를 포함해야 함 (PostgreSQL DISTINCT ON 제약)
    const waferItemIds = items.filter((i) => i.category.name === "웨이퍼").map((i) => i.id);
    const waferTxs = waferItemIds.length > 0
      ? await prisma.inventoryTx.findMany({
          where: { itemId: { in: waferItemIds }, type: "입고" },
          orderBy: [{ itemId: "asc" }, { id: "desc" }],
          distinct: ["itemId"],
          select: { itemId: true, waferResistance: true, waferThickness: true, waferDirection: true, waferSurface: true },
        })
      : [];
    const waferMap = new Map(waferTxs.map((tx) => [tx.itemId, tx]));

    // 타겟 품목의 최신 타겟유닛 속성 (한 번에 조회)
    const targetItemIds = items.filter((i) => i.category.name === "타겟").map((i) => i.id);
    const targetUnits = targetItemIds.length > 0
      ? await prisma.targetUnit.findMany({
          where: { itemId: { in: targetItemIds } },
          orderBy: [{ itemId: "asc" }, { id: "desc" }],
          distinct: ["itemId"],
          select: { itemId: true, purity: true, hasCopper: true },
        })
      : [];
    const targetMap = new Map(targetUnits.map((tu) => [tu.itemId, tu]));

    const result = items.map((item) => {
      const currentQty = (inMap.get(item.id) || 0) - (outMap.get(item.id) || 0);

      const attrs: Record<string, string> = {};
      if (item.category.name === "웨이퍼") {
        const wt = waferMap.get(item.id);
        if (wt) {
          if (wt.waferResistance) attrs["저항"] = wt.waferResistance;
          if (wt.waferThickness)  attrs["두께"] = wt.waferThickness;
          if (wt.waferDirection)  attrs["방향"] = wt.waferDirection;
          if (wt.waferSurface)    attrs["표면"] = wt.waferSurface;
        }
      }
      if (item.category.name === "타겟") {
        const tu = targetMap.get(item.id);
        if (tu?.purity)    attrs["순도"]   = tu.purity;
        if (tu?.hasCopper) attrs["Copper"] = tu.hasCopper;
      }

      return {
        id:          item.id,
        code:        item.code,
        name:        item.name,
        category:    item.category.name,
        currentQty,
        requiredQty: rqMap.get(item.id) || 0,
        attrs,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/status error:", error);
    return NextResponse.json({ error: "보유현황 조회 실패" }, { status: 500 });
  }
}

// PUT /api/status — 필요수량 저장
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

    const rq = await prisma.requiredQty.upsert({
      where:  { itemId: Number(itemId) },
      update: { quantity: qty },
      create: { itemId: Number(itemId), quantity: qty },
    });

    return NextResponse.json(rq);
  } catch (error) {
    console.error("PUT /api/status error:", error);
    return NextResponse.json({ error: "필요수량 저장 실패" }, { status: 500 });
  }
}
