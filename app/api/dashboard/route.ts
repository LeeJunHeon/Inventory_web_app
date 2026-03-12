import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 오늘 입고/출고/불출 집계
    const todayTxs = await prisma.inventoryTx.findMany({
      where: { date: { gte: today, lt: tomorrow } },
    });

    const todayIn = todayTxs.filter((t) => t.type === "입고");
    const todayOut = todayTxs.filter((t) => t.type === "출고");

    // 재고 부족 품목 수
    const requiredQtys = await prisma.requiredQty.findMany({
      where: { quantity: { gt: 0 } },
    });

    // 품목별 현재 보유수량 계산
    let shortageCount = 0;
    for (const rq of requiredQtys) {
      const inSum = await prisma.inventoryTx.aggregate({
        where: { itemId: rq.itemId, type: "입고" },
        _sum: { quantity: true },
      });
      const outSum = await prisma.inventoryTx.aggregate({
        where: { itemId: rq.itemId, type: { in: ["출고", "불출"] } },
        _sum: { quantity: true },
      });
      const current = (inSum._sum.quantity || 0) - (outSum._sum.quantity || 0);
      if (current < rq.quantity) shortageCount++;
    }

    // 총 품목 수
    const totalItems = await prisma.item.count({ where: { isActive: true } });

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
        count: todayIn.length,
        amount: todayIn.reduce((s, t) => s + Number(t.amount), 0),
      },
      todayOut: {
        count: todayOut.length,
        amount: todayOut.reduce((s, t) => s + Number(t.amount), 0),
      },
      shortageCount,
      totalItems,
      recent: recent.map((tx) => ({
        id: tx.id,
        date: tx.date.toISOString().split("T")[0].replace(/-/g, "."),
        type: tx.type,
        category: tx.item.category.name,
        name: tx.item.name,
        qty: tx.quantity,
        amount: Number(tx.amount),
        partner: tx.partner?.name || "",
        barcode: tx.barcode?.code || "",
      })),
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json({ error: "대시보드 조회 실패" }, { status: 500 });
  }
}
