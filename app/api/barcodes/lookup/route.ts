import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expandBarcodeVariants } from "@/lib/barcodeUtils";

export const dynamic = "force-dynamic";

const BARCODE_INCLUDE = {
  item: { include: { category: true } },
  targetUnit: { include: { item: { include: { category: true } } } },
} as const;

type BarcodeWithRelations = NonNullable<
  Awaited<ReturnType<typeof prisma.barcode.findFirst<{ include: typeof BARCODE_INCLUDE }>>>
>;

// 바코드 1건이 확정된 뒤의 공통 응답 생성 (비활성 차단 → item 해석 → 입고건 조회)
async function buildBarcodeResponse(barcode: BarcodeWithRelations) {
  // 비활성 바코드 차단 (출고/불출 방지)
  if (barcode.isActive === "N") {
    return NextResponse.json(
      { error: "비활성화된 바코드입니다. 폐기 처리된 타겟이거나 사용 중지된 바코드입니다." },
      { status: 400 }
    );
  }

  const item = barcode.item ?? barcode.targetUnit?.item ?? null;

  // 해당 바코드에 연결된 입고 트랜잭션 조회
  // 입고건이 정확히 1건일 때만 자동 연결. 2건 이상(레거시 다중 연결)이면
  // 조용히 최근 것을 고르지 않고 null 반환 → 프론트에서 직접 선택하게 함.
  const inbounds = await prisma.inventoryTx.findMany({
    where: { barcodeId: barcode.id, txType: "입고" },
    orderBy: { id: "desc" },
    select: { txNo: true },
  });
  const refTxNo = inbounds.length === 1 ? inbounds[0].txNo : null;

  return NextResponse.json({
    barcodeId:    barcode.id,
    itemId:       item?.id       ?? null,
    itemCode:     item?.code     ?? "",
    itemName:     item?.name     ?? "",
    category:     item?.category?.name ?? "",
    targetUnitId: barcode.targetUnitId ?? null,
    refTxNo,
    inboundCount: inbounds.length,
    ambiguous:    inbounds.length > 1,
  });
}

// GET /api/barcodes/lookup?code={바코드코드}
// 바코드로 품목 정보 + 가장 최근 입고 tx_no 반환 (출고/불출 시 ref_tx_no 자동 연결용)
export async function GET(request: NextRequest) {
  try {
    const code = new URL(request.url).searchParams.get("code");
    if (!code) {
      return NextResponse.json({ error: "code 파라미터가 필요합니다." }, { status: 400 });
    }

    // 1단계: 정확일치 (하이픈 변형 포함)
    const variants = expandBarcodeVariants(code);
    const barcode = await prisma.barcode.findFirst({
      where: {
        OR: variants.map(v => ({ code: { equals: v, mode: "insensitive" as const } })),
      },
      include: BARCODE_INCLUDE,
    });

    if (barcode) return buildBarcodeResponse(barcode);

    // 2단계: 정확일치 실패 → 하이픈 무시 부분일치 폴백
    const norm = code.replace(/-/g, "").toUpperCase();
    if (norm.length < 3) {
      return NextResponse.json({ error: "바코드를 찾을 수 없습니다." }, { status: 404 });
    }

    const rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM barcode
      WHERE is_active = 'Y'
        AND REPLACE(UPPER(code), '-', '') LIKE ${"%" + norm + "%"}
      ORDER BY id
      LIMIT 11
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "바코드를 찾을 수 없습니다." }, { status: 404 });
    }

    // 여러 건이면 자동 선택 금지 — 잘못된 로트를 집으면 재고가 틀어진다.
    if (rows.length >= 2) {
      return NextResponse.json({
        multiple: true,
        count: rows.length,
        error: `"${code}"와 일치하는 바코드가 ${rows.length >= 11 ? "11개 이상" : rows.length + "개"} 있습니다. 목록에서 선택하세요.`,
      });
    }

    const single = await prisma.barcode.findUnique({
      where: { id: rows[0].id },
      include: BARCODE_INCLUDE,
    });
    if (!single) {
      return NextResponse.json({ error: "바코드를 찾을 수 없습니다." }, { status: 404 });
    }
    return buildBarcodeResponse(single);
  } catch (error) {
    console.error("GET /api/barcodes/lookup error:", error);
    return NextResponse.json({ error: "바코드 조회 실패" }, { status: 500 });
  }
}
