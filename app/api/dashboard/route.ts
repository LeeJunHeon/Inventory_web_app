import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { auth } = await import("@/auth");
    const { prisma: p } = await import("@/lib/prisma");
    const session = await auth();
    let isEmployee = false;
    if (session?.user?.email) {
      const u = await p.user.findUnique({
        where: { email: session.user.email },
        select: { role: true },
      });
      isEmployee = u?.role === "employee";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 오늘 입고/출고/불출 집계
    const todayTxs = await prisma.inventoryTx.findMany({
      where: { txDate: { gte: today, lt: tomorrow } },
    });

    const todayIn = todayTxs.filter((t) => t.txType === "입고");
    const todayOut = todayTxs.filter((t) => t.txType === "출고");

    // 재고 부족 품목 수 — item.minStockQty 기준
    const itemsWithMin = await prisma.item.findMany({
      where: { minStockQty: { gt: 0 } },
      select: { id: true, minStockQty: true },
    });

    let shortageCount = 0;

    if (itemsWithMin.length > 0) {
      const itemIds = itemsWithMin.map((i) => i.id);

      const inSums = await prisma.inventoryTx.groupBy({
        by: ["itemId"],
        where: { itemId: { in: itemIds }, txType: "입고" },
        _sum: { qty: true },
      });

      const outSums = await prisma.inventoryTx.groupBy({
        by: ["itemId"],
        where: { itemId: { in: itemIds }, txType: { in: ["출고", "불출"] } },
        _sum: { qty: true },
      });

      const inMap = new Map(inSums.map((s) => [s.itemId, s._sum.qty || 0]));
      const outMap = new Map(outSums.map((s) => [s.itemId, s._sum.qty || 0]));

      for (const item of itemsWithMin) {
        const current = (inMap.get(item.id) || 0) - (outMap.get(item.id) || 0);
        if (current < item.minStockQty) shortageCount++;
      }
    }

    // 총 품목 수
    const totalItems = await prisma.item.count();

    // 위치별 현황 집계
    const locations = await prisma.location.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });

    const locationSummary = await Promise.all(locations.map(async (loc) => {
      const [locIn, locOut] = await Promise.all([
        prisma.inventoryTx.groupBy({
          by: ["itemId"],
          where: { locationId: loc.id, txType: "입고" },
          _sum: { qty: true },
        }),
        prisma.inventoryTx.groupBy({
          by: ["itemId"],
          where: { locationId: loc.id, txType: { in: ["출고", "불출"] } },
          _sum: { qty: true },
        }),
      ]);

      const inMap  = new Map(locIn.map(s  => [s.itemId, s._sum.qty || 0]));
      const outMap = new Map(locOut.map(s => [s.itemId, s._sum.qty || 0]));
      const allIds = [...new Set([...inMap.keys(), ...outMap.keys()])];

      if (allIds.length === 0) {
        return { locationId: loc.id, locationName: loc.name, totalItems: 0, shortageCount: 0 };
      }

      const itemsWithMin = await prisma.item.findMany({
        where: { id: { in: allIds }, minStockQty: { gt: 0 } },
        select: { id: true, minStockQty: true },
      });
      const minMap = new Map(itemsWithMin.map(i => [i.id, i.minStockQty]));

      let locTotal = 0;
      let locShortage = 0;
      for (const itemId of allIds) {
        const current = (inMap.get(itemId) || 0) - (outMap.get(itemId) || 0);
        if (current > 0) locTotal++;
        const min = minMap.get(itemId);
        if (min && min > 0 && current < min) locShortage++;
      }

      return { locationId: loc.id, locationName: loc.name, totalItems: locTotal, shortageCount: locShortage };
    }));

    // 최근 5건
    const recent = await prisma.inventoryTx.findMany({
      take: 5,
      orderBy: { id: "desc" },
      include: {
        item: { include: { category: true } },
        partner: true,
        barcode: true,
      },
    });

    return NextResponse.json({
      todayIn: {
        count:  todayIn.length,
        amount: isEmployee ? 0 : todayIn.reduce((s, t) => s + Number(t.amount || 0), 0),
      },
      todayOut: {
        count:  todayOut.length,
        amount: isEmployee ? 0 : todayOut.reduce((s, t) => s + Number(t.amount || 0), 0),
      },
      shortageCount,
      totalItems,
      locationSummary,
      recent: recent.map((tx) => ({
        id: tx.id,
        date: tx.txDate.toISOString().split("T")[0].replace(/-/g, "."),
        type: tx.txType,
        category: tx.item.category.name,
        name: tx.item.name,
        qty: tx.qty,
        amount: isEmployee ? 0 : Number(tx.amount || 0),
        partner: tx.partner?.name || "",
        barcode: tx.barcode?.code || "",
      })),
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json({ error: "대시보드 조회 실패" }, { status: 500 });
  }
}
