import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATUS_ORDER: Record<string, number> = {
  "미사용": 0,
  "사용중": 1,
  "폐기": 2,
  "판매완료": 3,
};

export async function GET() {
  try {
    const targetUnits = await prisma.targetUnit.findMany({
      include: {
        item: true,
        barcodes: { where: { isActive: "Y" }, take: 1 },
      },
    });

    const result = await Promise.all(
      targetUnits.map(async (tu) => {
        const latestLog = await prisma.targetLog.findFirst({
          where: {
            targetUnitId: tu.id,
            logType: { in: ["측정", "measure"] },
            weight: { not: null },
          },
          orderBy: { loggedAt: "desc" },
          include: { location: true },
        });

        const inboundTx = await prisma.inventoryTx.findFirst({
          where: {
            targetUnitId: tu.id,
            txType: "입고",
          },
          orderBy: { txDate: "desc" },
          select: { txDate: true },
        });

        return {
          id: tu.id,
          status: tu.status,
          barcodeCode: tu.barcodes[0]?.code ?? "",
          itemCode: tu.item?.code ?? "",
          itemName: tu.item?.name ?? "",
          latestWeight: latestLog?.weight ? Number(latestLog.weight) : null,
          latestLoggedAt: latestLog?.loggedAt?.toISOString() ?? null,
          locationName: latestLog?.location?.name ?? null,
          inboundDate: inboundTx?.txDate?.toISOString().split("T")[0] ?? null,
        };
      })
    );

    result.sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99;
      const sb = STATUS_ORDER[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return a.id - b.id;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/targets/status error:", error);
    return NextResponse.json({ error: "타겟 상태 조회 실패" }, { status: 500 });
  }
}
