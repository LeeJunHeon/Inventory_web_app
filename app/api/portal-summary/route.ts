import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/portal-summary
// 포털의 AppCardGrid가 호출 — 재고관리 요약 정보 제공
export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalItems, todayIn, todayOut, todayUse] = await Promise.all([
      prisma.item.count(),
      prisma.inventoryTx.count({ where: { txDate: { gte: today, lt: tomorrow }, txType: "입고" } }),
      prisma.inventoryTx.count({ where: { txDate: { gte: today, lt: tomorrow }, txType: "출고" } }),
      prisma.inventoryTx.count({ where: { txDate: { gte: today, lt: tomorrow }, txType: "불출" } }),
    ]);

    return NextResponse.json(
      {
        totalItems,
        todayIn,    // 오늘 입고 건수
        todayOut,   // 오늘 출고 건수
        todayUse,   // 오늘 불출 건수
        // 하위호환: 기존 todayTxCount = 입고+출고+불출 합
        todayTxCount: todayIn + todayOut + todayUse,
      }
    );
  } catch (error) {
    console.error("GET /api/portal-summary error:", error);
    return NextResponse.json(
      { totalItems: 0, todayIn: 0, todayOut: 0, todayUse: 0, todayTxCount: 0 }
    );
  }
}
