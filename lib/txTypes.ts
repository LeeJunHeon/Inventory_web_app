import { prisma } from "@/lib/prisma";

/** 보유수량에서 항상 차감되는 유형 (폐기는 getStockMinusDisposals로 별도 분류) */
export const STOCK_MINUS_TYPES = ["출고", "불출", "사용중"];

/** 입고건 잔여수량을 점유하는 유형 (refTxNo=입고건 필터와 함께 사용) */
export const LOT_CONSUME_TYPES = ["출고", "불출", "사용중", "폐기"];

/** 보유수량을 차감해야 하는 폐기 건 반환 (사용중을 참조한 폐기는 제외) */
export async function getStockMinusDisposals(
  filter: { itemIds?: number[]; locationId?: number }
): Promise<{ itemId: number; locationId: number; qty: number }[]> {
  const rows = await prisma.inventoryTx.findMany({
    where: {
      txType: "폐기",
      ...(filter.itemIds ? { itemId: { in: filter.itemIds } } : {}),
      ...(filter.locationId ? { locationId: filter.locationId } : {}),
    },
    select: { itemId: true, locationId: true, qty: true, refTxNo: true },
  });
  if (rows.length === 0) return [];
  const refNos = [...new Set(rows.map(r => r.refTxNo).filter((v): v is string => !!v))];
  const refs = refNos.length > 0
    ? await prisma.inventoryTx.findMany({
        where: { txNo: { in: refNos } },
        select: { txNo: true, txType: true },
      })
    : [];
  const usingRefSet = new Set(refs.filter(r => r.txType === "사용중").map(r => r.txNo));
  return rows
    .filter(r => !(r.refTxNo && usingRefSet.has(r.refTxNo)))
    .map(({ itemId, locationId, qty }) => ({ itemId, locationId, qty }));
}

/** getStockMinusDisposals 결과를 itemId → 합계 Map으로 접는다 */
export function sumDisposalsByItem(
  rows: { itemId: number; qty: number }[]
): Map<number, number> {
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.itemId, (map.get(r.itemId) ?? 0) + r.qty);
  return map;
}

/** getStockMinusDisposals 결과를 특정 위치로 한정해 itemId → 합계 Map으로 접는다 */
export function sumDisposalsByItemAtLocation(
  rows: { itemId: number; locationId: number; qty: number }[],
  locationId: number
): Map<number, number> {
  return sumDisposalsByItem(rows.filter(r => r.locationId === locationId));
}

/**
 * 타겟유닛이 폐기될 때 재고 원장에 '폐기' tx를 자동 생성한다.
 * refTxNo는 그 타겟의 사용중 전표 → 없으면 바코드 입고 전표 → 둘 다 없으면 null.
 * 같은 타겟유닛에 폐기 tx가 이미 있으면 아무것도 하지 않는다(중복 방지).
 */
export async function createDisposalTxForTarget(opts: {
  targetUnitId: number;
  userId?: number | null;
}): Promise<void> {
  const existing = await prisma.inventoryTx.findFirst({
    where:  { targetUnitId: opts.targetUnitId, txType: "폐기" },
    select: { id: true },
  });
  if (existing) return;

  const tu = await prisma.targetUnit.findUnique({
    where:  { id: opts.targetUnitId },
    select: { itemId: true },
  });
  if (!tu?.itemId) return;

  const bc = await prisma.barcode.findFirst({
    where:   { targetUnitId: opts.targetUnitId },
    orderBy: { id: "asc" },
    select:  { id: true },
  });

  const usingTx = await prisma.inventoryTx.findFirst({
    where:   { targetUnitId: opts.targetUnitId, txType: "사용중" },
    orderBy: { id: "desc" },
    select:  { txNo: true, locationId: true },
  });
  const inboundTx = usingTx || !bc
    ? null
    : await prisma.inventoryTx.findFirst({
        where:  { barcodeId: bc.id, txType: "입고" },
        select: { txNo: true, locationId: true },
      });

  const refTxNo = usingTx?.txNo ?? inboundTx?.txNo ?? null;
  // 원장 위치는 재고가 있던 곳(사용중→입고 체인)을 따른다. 폐기가 일어난 물리 위치는 target_log가 보관.
  const locationId = usingTx?.locationId ?? inboundTx?.locationId ?? 1;

  const allTxNos = await prisma.inventoryTx.findMany({
    where:  { txNo: { not: null } },
    select: { txNo: true },
  });
  const lastNo = allTxNos.reduce((max, t) => {
    const n = parseInt(t.txNo ?? "", 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);

  await prisma.inventoryTx.create({
    data: {
      txNo:         String(lastNo + 1),
      txType:       "폐기",
      txDate:       new Date(),
      itemId:       tu.itemId,
      targetUnitId: opts.targetUnitId,
      barcodeId:    bc?.id ?? null,
      locationId,
      qty:          1,
      userId:       opts.userId ?? null,
      refTxNo,
      memo:         "타겟 폐기 - 자동 기록",
    },
  });
}
