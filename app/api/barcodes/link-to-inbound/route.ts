import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUserId, logActivity } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// POST /api/barcodes/link-to-inbound
// Body: { inventoryTxId: number, memo?: string }
// 기존 입고건에 바코드를 사후 부여 (1:1 매핑)
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const body = await request.json();
    const inventoryTxId = Number(body?.inventoryTxId);

    if (!inventoryTxId || isNaN(inventoryTxId)) {
      return NextResponse.json({ error: "inventoryTxId가 필요합니다." }, { status: 400 });
    }

    const tx = await prisma.inventoryTx.findUnique({
      where: { id: inventoryTxId },
      include: { item: { include: { category: true } } },
    });

    if (!tx) {
      return NextResponse.json({ error: "입고건을 찾을 수 없습니다." }, { status: 404 });
    }
    if (tx.txType !== "입고") {
      return NextResponse.json({ error: "입고건만 바코드를 연결할 수 있습니다." }, { status: 400 });
    }
    if (tx.barcodeId !== null) {
      return NextResponse.json({ error: "이미 바코드가 연결된 입고건입니다." }, { status: 400 });
    }

    const categoryName = tx.item.category.name;
    if (categoryName === "타겟" || categoryName === "ALD Canister") {
      return NextResponse.json(
        { error: "타겟/ALD Canister는 입고 시점에 바코드가 자동 생성됩니다. 사후 연결은 지원하지 않습니다." },
        { status: 400 }
      );
    }

    // 카테고리별 prefix 결정
    const CATEGORY_PREFIX: Record<string, string> = {
      "타겟": "T",
      "웨이퍼": "W",
      "가스": "G",
      "기자재": "E",
      "기자재/소모품": "E",   // ← 실제 DB 카테고리명 매핑
      "ALD Canister": "C",
    };
    const prefix = CATEGORY_PREFIX[categoryName] ?? categoryName.charAt(0).toUpperCase();

    const sessionUserId = await getSessionUserId();

    const newBarcode = await prisma.$transaction(async (db) => {
      const seq = await db.barcodeSeq.upsert({
        where:  { prefix },
        update: { lastNo: { increment: 1 } },
        create: { prefix, lastNo: 1 },
      });
      const code = `${prefix}-${seq.lastNo}`;

      const created = await db.barcode.create({
        data: {
          code,
          itemId:       tx.itemId,
          targetUnitId: null,
          isActive:     "Y",
          memo:         body.memo || null,
        },
      });

      await db.inventoryTx.update({
        where: { id: tx.id },
        data:  { barcodeId: created.id },
      });

      return created;
    });

    await logActivity(
      sessionUserId,
      "CREATE",
      "barcode",
      newBarcode.id,
      `사후 연결: 입고 ${tx.txNo}`
    );

    return NextResponse.json(
      {
        id:         newBarcode.id,
        code:       newBarcode.code,
        itemCode:   tx.item.code,
        itemName:   tx.item.name,
        category:   tx.item.category.name,
        linkedTxNo: tx.txNo,
        isActive:   "Y",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/barcodes/link-to-inbound error:", error);
    return NextResponse.json({ error: "바코드 사후 연결 실패", detail: String(error) }, { status: 500 });
  }
}
