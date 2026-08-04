import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/auth-helpers";

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

// ── 자동 상태 전이 기록 / 복원 판정 ────────────────────
//
// 거래 등록이 타겟·캐니스터의 status를 자동으로 바꾸는 경우가 있다(출고→판매완료 등).
// 그 거래를 삭제할 때 상태를 되돌리려면 "무엇이 무엇으로 바뀌었는지"가 남아 있어야 한다.
// recordAutoTransition이 구조화된 기록을 남기고, resolveAutoTransitionRevert가
// 그 기록만으로 안전하게 되돌릴 수 있는지 판정한다.
//
// 원칙: 틀린 복원을 하느니 차단한다. 조건이 하나라도 불충분하면 ok:false.

/** 자동 상태 전이를 activity_log에 구조화해 기록 (되돌리기 판정의 근거) */
export async function recordAutoTransition(opts: {
  userId: number | null;
  targetUnitId: number;
  from: string;
  to: string;
  byTxNo: string;
  byTxType: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const { userId, targetUnitId, from, to, byTxNo, byTxType, extra } = opts;
  await logActivity(
    userId,
    "UPDATE",
    "target_unit",
    targetUnitId,
    `상태: ${from} → ${to} (전표 ${byTxNo} ${byTxType} 자동전이)`,
    { autoTransition: true, targetUnitId, from, to, byTxNo, byTxType, ...(extra ?? {}) }
  );
}

export type AutoTransitionRevert =
  | { ok: true;  revertTo: string; extra: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * 거래 삭제 시 자동 전이를 되돌릴 수 있는지 판정한다. 판정만 하고 UPDATE는 하지 않는다.
 * (a)~(e) 다섯 조건을 모두 통과해야만 ok:true.
 */
export async function resolveAutoTransitionRevert(opts: {
  targetUnitId: number;
  txNo: string;
}): Promise<AutoTransitionRevert> {
  const { targetUnitId, txNo } = opts;

  // (a) 이 전표가 만든 전이 기록 찾기
  const log = await prisma.activityLog.findFirst({
    where: {
      tableName: "target_unit",
      recordId:  targetUnitId,
      action:    "UPDATE",
      snapshot:  { contains: `"byTxNo":"${txNo}"` },
    },
    orderBy: { id: "desc" },
    select: { id: true, snapshot: true },
  });
  if (!log) {
    return { ok: false, reason: "이 거래의 상태 전이 기록이 없습니다" };
  }

  // (b) 스냅샷 해석
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(log.snapshot ?? "");
  } catch {
    return { ok: false, reason: "전이 기록을 해석할 수 없습니다" };
  }
  if (!parsed || parsed.autoTransition !== true) {
    return { ok: false, reason: "전이 기록을 해석할 수 없습니다" };
  }

  // (c) 방어적 재확인 — contains 매칭이 다른 전표를 집었을 가능성 차단
  if (parsed.byTxNo !== txNo) {
    return { ok: false, reason: "전이 기록의 전표번호가 일치하지 않습니다" };
  }

  const from = typeof parsed.from === "string" ? parsed.from : null;
  const to   = typeof parsed.to   === "string" ? parsed.to   : null;
  if (!from || !to) {
    return { ok: false, reason: "전이 기록을 해석할 수 없습니다" };
  }

  // (d) 현재 상태가 전이 결과와 정확히 일치해야 한다
  const tu = await prisma.targetUnit.findUnique({
    where:  { id: targetUnitId },
    select: { status: true },
  });
  if (!tu) {
    return { ok: false, reason: "연결된 타겟/캐니스터를 찾을 수 없습니다" };
  }
  if (tu.status !== to) {
    return {
      ok: false,
      reason: `현재 상태(${tu.status})가 전이 결과(${to})와 다릅니다. 이후 다른 변경이 있었습니다`,
    };
  }

  // (e) 그 전이 이후 같은 타겟에 다른 상태 변경 이력이 있으면 차단
  const laterCount = await prisma.activityLog.count({
    where: {
      tableName: "target_unit",
      recordId:  targetUnitId,
      action:    "UPDATE",
      id:        { gt: log.id },
    },
  });
  if (laterCount > 0) {
    return { ok: false, reason: "전이 이후 다른 상태 변경 이력이 있습니다" };
  }

  return { ok: true, revertTo: from, extra: parsed };
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
