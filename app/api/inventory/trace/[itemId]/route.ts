import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/inventory/trace/[itemId]?barcodeId=... — 품목 거래 이력 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const itemId = Number(params.itemId);
    if (isNaN(itemId)) {
      return NextResponse.json({ error: "유효하지 않은 itemId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const barcodeIdParam = searchParams.get("barcodeId");

    const txs = await prisma.inventoryTx.findMany({
      where: {
        itemId,
        ...(barcodeIdParam ? { barcodeId: Number(barcodeIdParam) } : {}),
      },
      include: {
        partner:  { select: { name: true } },
        barcode:  { select: { code: true } },
        location: { select: { name: true } },
        txReason: { select: { name: true } },
        user:     { select: { name: true } },
      },
      orderBy: [{ txDate: "desc" }, { id: "desc" }],
    });

    const result = txs.map(tx => ({
      id:           tx.id,
      txType:       tx.txType,
      txNo:         tx.txNo        ?? null,
      refTxNo:      tx.refTxNo     ?? null,
      txDate:       tx.txDate.toISOString().split("T")[0].replace(/-/g, "."),
      qty:          tx.qty,
      unitPrice:    tx.unitPrice != null ? Number(tx.unitPrice) : null,
      currency:     tx.currency    ?? "KRW",
      memo:         tx.memo        ?? "",
      partnerName:  tx.partner?.name   ?? "",
      barcodeCode:  tx.barcode?.code   ?? "",
      locationName: tx.location?.name  ?? "",
      reasonName:   tx.txReason?.name  ?? "",
      userName:     tx.user?.name      ?? "",
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/inventory/trace/[itemId] error:", error);
    return NextResponse.json({ error: "이력 조회 실패" }, { status: 500 });
  }
}
