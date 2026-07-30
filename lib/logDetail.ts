import { prisma } from "@/lib/prisma";

/**
 * activity_log.detail 스냅샷 생성 헬퍼.
 *
 * CREATE/DELETE 시점의 내용을 사람이 읽을 수 있는 문자열로 굳혀 둔다.
 * (레코드가 삭제되면 라이브 조회로는 복원할 수 없으므로)
 * 형식은 기존 UPDATE diff와 동일하게 " | " 구분자를 쓰고, 값이 없는 항목은 생략한다.
 */

function join(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(" | ");
}

// ── inventory_tx ──────────────────────────────────────
type TxSnapshot = {
  txType:    string;
  txNo:      string | null;
  qty:       number;
  unitPrice: unknown;
  memo:      string | null;
  refTxNo:   string | null;
  item?:     { code: string; name: string } | null;
  location?: { name: string } | null;
  partner?:  { name: string } | null;
  barcode?:  { code: string } | null;
  user?:     { name: string } | null;
};

export function formatInventoryTxDetail(tx: TxSnapshot): string {
  return join([
    `[${tx.txType}] ${tx.item?.name ?? "-"}(${tx.item?.code ?? "-"}) × ${tx.qty}`,
    tx.txNo               ? `전표:${tx.txNo}` : null,
    tx.location           ? `위치:${tx.location.name}` : null,
    tx.partner            ? `거래처:${tx.partner.name}` : null,
    tx.unitPrice != null  ? `단가:${Number(tx.unitPrice).toLocaleString("ko-KR")}` : null,
    tx.barcode            ? `바코드:${tx.barcode.code}` : null,
    tx.refTxNo            ? `참조:${tx.refTxNo}` : null,
    tx.user               ? `등록자:${tx.user.name}` : null,
    tx.memo               ? `메모:${tx.memo}` : null,
  ]);
}

/** 생성 직후의 inventory_tx를 다시 읽어 스냅샷 구성. 실패하면 undefined (로그 기록 자체는 막지 않음) */
export async function buildInventoryTxDetail(txId: number): Promise<string | undefined> {
  try {
    const tx = await prisma.inventoryTx.findUnique({
      where:   { id: txId },
      include: { item: true, location: true, partner: true, barcode: true },
    });
    return tx ? formatInventoryTxDetail(tx) : undefined;
  } catch {
    return undefined;
  }
}

// ── target_log ────────────────────────────────────────
type TargetLogSnapshot = {
  logType:  string;
  weight:   unknown;
  reason:   string | null;
  targetUnit?: {
    barcodes?: { code: string }[];
    item?:     { name: string } | null;
  } | null;
  location?: { name: string } | null;
};

export function formatTargetLogDetail(log: TargetLogSnapshot): string {
  const bc   = log.targetUnit?.barcodes?.[0]?.code ?? "";
  const name = log.targetUnit?.item?.name ?? "";
  return join([
    `[${log.logType}] ${[bc, name].filter(Boolean).join(" ")}`.trim(),
    log.weight != null ? `무게:${Number(log.weight).toFixed(3)}g` : null,
    log.location       ? `위치:${log.location.name}` : null,
    log.reason         ? `사유:${log.reason}` : null,
  ]);
}

/** 생성 직후의 target_log를 다시 읽어 스냅샷 구성. 실패하면 undefined */
export async function buildTargetLogDetail(logId: number): Promise<string | undefined> {
  try {
    const log = await prisma.targetLog.findUnique({
      where: { id: logId },
      include: {
        // 폐기 시 바코드가 isActive="N"으로 내려가므로 활성 필터 없이 1건만 집는다
        targetUnit: { include: { barcodes: { take: 1, orderBy: { id: "asc" } }, item: true } },
        location:   true,
      },
    });
    return log ? formatTargetLogDetail(log) : undefined;
  } catch {
    return undefined;
  }
}

// ── 마스터 데이터 스냅샷 (CREATE/DELETE detail) ────────
export function formatItemDetail(item: {
  code: string; name: string; unit: string | null;
  category?: { name: string } | null;
}): string {
  return join([
    `${item.code} ${item.name}`,
    item.category ? `품목군:${item.category.name}` : null,
    item.unit     ? `단위:${item.unit}` : null,
  ]);
}

export function formatPartnerDetail(p: {
  name: string; managerName: string | null; contact: string | null;
}): string {
  return join([
    p.name,
    p.managerName ? `담당자:${p.managerName}` : null,
    p.contact     ? `연락처:${p.contact}` : null,
  ]);
}

export function formatBarcodeDetail(bc: {
  code: string; item?: { name: string } | null;
}): string {
  return join([
    bc.code,
    bc.item ? `품목:${bc.item.name}` : null,
  ]);
}

// ── UPDATE 로그용 대상 헤더 ────────────────────────────
// diff 문자열만으로는 "무엇이" 바뀌었는지 알 수 없으므로 앞에 대상을 붙인다.
// 모두 순수 함수 — 호출부가 이미 조회해 둔 before 객체를 그대로 받는다(추가 쿼리 금지).

export function inventoryTxHeader(tx: {
  txNo?: string | null; item?: { name: string; code: string } | null;
}): string {
  return `[${tx.item?.name ?? ""}(${tx.item?.code ?? ""}) · 전표${tx.txNo ?? "-"}]`;
}

export function itemHeader(i: { code: string; name: string }): string {
  return `[${i.code} ${i.name}]`;
}

export function partnerHeader(p: { name: string }): string {
  return `[${p.name}]`;
}

export function barcodeHeader(b: { code: string; item?: { name: string } | null }): string {
  return `[${b.code}${b.item?.name ? ` · ${b.item.name}` : ""}]`;
}

export function targetUnitHeader(tu: {
  barcodes?: { code: string }[]; item?: { name: string } | null;
}): string {
  return `[${tu.barcodes?.[0]?.code ?? ""} ${tu.item?.name ?? ""}]`.replace("[ ", "[").trim();
}
