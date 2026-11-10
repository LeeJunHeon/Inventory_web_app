import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockMinusDisposals, sumDisposalsByItem, MOVE_IN, MOVE_OUT } from "@/lib/txTypes";
import { WAFER_CATEGORY, formatWaferSpecSummary } from "@/lib/waferSpec";
import { waferSpecSearchWhere } from "@/lib/waferSpecServer";
import { TARGET_CATEGORY, formatPurity, parsePuritySearch } from "@/lib/targetPurity";

export const dynamic = "force-dynamic";

// GET /api/inventory/trace?query=... — 품목/바코드 검색
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query      = searchParams.get("query")?.trim() ?? "";
    const searchType = searchParams.get("searchType") ?? "전체";

    if (!query) return NextResponse.json([]);

    // 전체 검색어가 순도 숫자면 실물 순도 일치도 OR (항상 숫자 equals)
    const puritySearch = searchType === "전체" ? parsePuritySearch(query) : null;

    const whereCondition = (() => {
      if (searchType === "바코드")  return { barcodes: { some: { code: { equals: query, mode: "insensitive" as const } } } };
      if (searchType === "품목코드") return { code: { contains: query, mode: "insensitive" as const } };
      if (searchType === "품목명")  return { name: { contains: query, mode: "insensitive" as const } };
      return {
        OR: [
          { code: { contains: query, mode: "insensitive" as const } },
          { name: { contains: query, mode: "insensitive" as const } },
          { barcodes: { some: { code: { contains: query, mode: "insensitive" as const } } } },
          waferSpecSearchWhere(query, false),
          ...(puritySearch != null ? [{ targetUnits: { some: { purity: puritySearch } } }] : []),
        ],
      };
    })();

    const items = await prisma.item.findMany({
      where: whereCondition,
      include: {
        category: { select: { name: true } },
        barcodes: { select: { id: true, code: true, isActive: true, targetUnit: { select: { purity: true } } } },
        targetUnits: { select: { purity: true } },
        inventoryTxs: { select: { txType: true, qty: true } },
        waferSpec: true,
      },
      take: 20,
    });

    // 폐기는 사용중을 참조한 건(이미 사용중에서 차감됨)을 제외하고만 보유수량을 깎는다
    const disposalMap = sumDisposalsByItem(
      await getStockMinusDisposals({ itemIds: items.map(i => i.id) })
    );

    const result = items.map(item => {
      // 바코드 검색 시 해당 바코드만 필터링
      // 순도 검색으로 걸린 품목이면 그 순도인 바코드만 (순도 바코드가 없으면 다른 조건으로 걸린 것이므로 전부)
      const purityOf = (b: { targetUnit: { purity: unknown } | null }) =>
        b.targetUnit?.purity != null ? Number(b.targetUnit.purity) : null;
      const purityBarcodes = puritySearch != null
        ? item.barcodes.filter(b => purityOf(b) === puritySearch)
        : [];
      const filteredBarcodes = searchType === "바코드"
        ? item.barcodes.filter(b => b.code.toLowerCase() === query.toLowerCase())
        : purityBarcodes.length > 0 ? purityBarcodes : item.barcodes;

      // 타겟 품목 카드: 실물 순도 종류 (작은 값부터, 중복 제거, 순도 없는 실물 무시)
      const purities = [...new Set(
        item.targetUnits.map(u => u.purity != null ? Number(u.purity) : null)
          .filter((v): v is number => v != null)
      )].sort((a, b) => a - b);

      const inbound  = item.inventoryTxs.filter(t => t.txType === "입고");
      const outbound = item.inventoryTxs.filter(t => t.txType === "출고");
      const disburse = item.inventoryTxs.filter(t => t.txType === "불출");
      const using    = item.inventoryTxs.filter(t => t.txType === "사용중");
      const disposal = item.inventoryTxs.filter(t => t.txType === "폐기");
      // 이동은 품목 총량에는 영향이 없다(입/출이 상쇄) — 건수·흐름 표시용
      const moveIn   = item.inventoryTxs.filter(t => t.txType === MOVE_IN);
      const moveOut  = item.inventoryTxs.filter(t => t.txType === MOVE_OUT);

      const totalIn  =
        inbound.reduce((s, t) => s + t.qty, 0) +
        moveIn.reduce((s, t) => s + t.qty, 0);
      const totalOut =
        moveOut.reduce((s, t) => s + t.qty, 0) +
        outbound.reduce((s, t) => s + t.qty, 0) +
        disburse.reduce((s, t) => s + t.qty, 0) +
        using.reduce((s, t) => s + t.qty, 0) +
        (disposalMap.get(item.id) ?? 0);

      return {
        itemId:    item.id,
        itemCode:  item.code,
        itemName:  item.name,
        category:  item.category?.name ?? "",
        specSummary: item.category?.name === WAFER_CATEGORY
          ? formatWaferSpecSummary(item.waferSpec, { labeled: false })
          : item.category?.name === TARGET_CATEGORY && purities.length > 0
            ? `순도 ${purities.map(v => formatPurity(v)).join(" · ")}`
            : null,
        barcodes:  filteredBarcodes.map(b => ({ id: b.id, code: b.code, isActive: b.isActive, purity: purityOf(b) })),
        txCount:   {
          inbound:  inbound.length,
          outbound: outbound.length,
          disburse: disburse.length,
          using:    using.length,
          disposal: disposal.length,
          moveIn:   moveIn.length,
          moveOut:  moveOut.length,
        },
        currentQty: totalIn - totalOut,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/inventory/trace error:", error);
    return NextResponse.json({ error: "검색 실패" }, { status: 500 });
  }
}
