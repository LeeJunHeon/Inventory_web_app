import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/inventory/trace?query=... — 품목/바코드 검색
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.trim() ?? "";

    if (!query) return NextResponse.json([]);

    const items = await prisma.item.findMany({
      where: {
        OR: [
          { code: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { barcodes: { some: { code: { contains: query, mode: "insensitive" } } } },
        ],
      },
      include: {
        category: { select: { name: true } },
        barcodes: { select: { id: true, code: true, isActive: true } },
        inventoryTxs: { select: { txType: true, qty: true } },
      },
      take: 20,
    });

    const result = items.map(item => {
      const inbound  = item.inventoryTxs.filter(t => t.txType === "입고");
      const outbound = item.inventoryTxs.filter(t => t.txType === "출고");
      const disburse = item.inventoryTxs.filter(t => t.txType === "불출");

      const totalIn  = inbound.reduce((s, t) => s + t.qty, 0);
      const totalOut = (outbound.reduce((s, t) => s + t.qty, 0)) + (disburse.reduce((s, t) => s + t.qty, 0));

      return {
        itemId:    item.id,
        itemCode:  item.code,
        itemName:  item.name,
        category:  item.category?.name ?? "",
        barcodes:  item.barcodes.map(b => ({ id: b.id, code: b.code, isActive: b.isActive })),
        txCount:   { inbound: inbound.length, outbound: outbound.length, disburse: disburse.length },
        currentQty: totalIn - totalOut,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/inventory/trace error:", error);
    return NextResponse.json({ error: "검색 실패" }, { status: 500 });
  }
}
