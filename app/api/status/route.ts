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

    const result = await Promise.all(
      items.map(async (item) => {
        const inSum = await prisma.inventoryTx.aggregate({
          where: { itemId: item.id, type: "입고" },
          _sum: { quantity: true },
        });
        const outSum = await prisma.inventoryTx.aggregate({
          where: { itemId: item.id, type: { in: ["출고", "불출"] } },
          _sum: { quantity: true },
        });
        const currentQty = (inSum._sum.quantity || 0) - (outSum._sum.quantity || 0);

        const rq = await prisma.requiredQty.findUnique({ where: { itemId: item.id } });

        const attrs: Record<string, string> = {};
        if (item.category.name === "웨이퍼") {
          const latestTx = await prisma.inventoryTx.findFirst({
            where: { itemId: item.id, type: "입고" },
            orderBy: { id: "desc" },
          });
          if (latestTx) {
            if (latestTx.waferResistance) attrs["저항"] = latestTx.waferResistance;
            if (latestTx.waferThickness)  attrs["두께"] = latestTx.waferThickness;
            if (latestTx.waferDirection)  attrs["방향"] = latestTx.waferDirection;
            if (latestTx.waferSurface)    attrs["표면"] = latestTx.waferSurface;
          }
        }
        if (item.category.name === "타겟") {
          const tu = await prisma.targetUnit.findFirst({
            where: { itemId: item.id },
            orderBy: { id: "desc" },
          });
          if (tu?.purity)    attrs["순도"]   = tu.purity;
          if (tu?.hasCopper) attrs["Copper"] = tu.hasCopper;
        }

        return {
          id:          item.id,
          code:        item.code,
          name:        item.name,
          category:    item.category.name,
          currentQty,
          requiredQty: rq?.quantity || 0,
          attrs,
        };
      })
    );

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
    // body: { itemId: number, quantity: number }
    const { itemId, quantity } = body;

    if (!itemId || quantity === undefined) {
      return NextResponse.json({ error: "itemId, quantity 필요" }, { status: 400 });
    }

    const rq = await prisma.requiredQty.upsert({
      where:  { itemId: Number(itemId) },
      update: { quantity: Number(quantity) },
      create: { itemId: Number(itemId), quantity: Number(quantity) },
    });

    return NextResponse.json(rq);
  } catch (error) {
    console.error("PUT /api/status error:", error);
    return NextResponse.json({ error: "필요수량 저장 실패" }, { status: 500 });
  }
}
