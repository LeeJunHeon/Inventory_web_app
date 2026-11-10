// 타겟 순도(%) 검증·정규화. 클라이언트·서버 공용 — prisma 를 import 하지 않는다.

export const TARGET_CATEGORY = "타겟";

export const PURITY_REQUIRED_ERROR = "순도를 입력해주세요.";
export const PURITY_FORMAT_ERROR   = "순도는 0 초과 100 이하, 소수점 셋째 자리까지 입력해주세요.";

export type PurityResult = { ok: true; value: number } | { ok: false; error: string };

/** 순도 입력값 검증. 숫자, 0 초과 100 이하, 소수점 셋째 자리까지. 통과 시 숫자로 정규화 */
export function validateTargetPurity(input: unknown): PurityResult {
  if (input == null) return { ok: false, error: PURITY_REQUIRED_ERROR };
  const text = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : null;
  if (text === null) return { ok: false, error: PURITY_FORMAT_ERROR };
  if (text === "") return { ok: false, error: PURITY_REQUIRED_ERROR };
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return { ok: false, error: PURITY_FORMAT_ERROR };
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return { ok: false, error: PURITY_FORMAT_ERROR };
  return { ok: true, value };
}

/** 순도 입력값이 비었는지 (수정 화면에서 "바꾸지 않음" 판단용) */
export function isPurityEmpty(input: unknown): boolean {
  return input == null || (typeof input === "string" && input.trim() === "");
}

type PurityHolder = { purity: unknown } | null | undefined;
type TxUnitRef = {
  targetUnitId?: number | null;
  targetUnit?: PurityHolder;
  barcode?: { targetUnitId?: number | null; targetUnit?: PurityHolder } | null;
};

/** 전표의 실물 id — tx.targetUnitId, 없으면 바코드의 실물 (옛 전표는 바코드로만 연결된 경우가 있다) */
export function txUnitId(tx: TxUnitRef): number | null {
  return tx.targetUnitId ?? tx.barcode?.targetUnitId ?? null;
}

/** 전표의 실물 순도 — tx.targetUnit, 없으면 tx.barcode.targetUnit */
export function txUnitPurity(tx: TxUnitRef): number | null {
  const p = tx.targetUnit?.purity ?? tx.barcode?.targetUnit?.purity;
  return p != null ? Number(p) : null;
}

/** 순도 표시 — 99.99 → "99.99%", 값이 없으면 null. 화면·엑셀·API 공용 */
export function formatPurity(v: number | null | undefined): string | null {
  return v != null && Number.isFinite(v) ? `${v}%` : null;
}

/**
 * 검색어를 순도 숫자로 읽는다. 앞뒤 공백과 끝의 % 를 떼고 validateTargetPurity 를 통과하면 그 숫자, 아니면 null.
 * 순도 검색은 항상 숫자 일치(equals) — contains 를 쓰면 99.99 검색에 99.999 가 섞인다.
 */
export function parsePuritySearch(q: string | null | undefined): number | null {
  if (q == null) return null;
  const text = q.trim().replace(/%$/, "").trim();
  if (text === "") return null;
  const r = validateTargetPurity(text);
  return r.ok ? r.value : null;
}

/** 바코드 옆 순도 — "T-55 · 99.999%", 순도 없으면 바코드만 */
export function barcodeWithPurity(code: string, purity: number | null | undefined): string {
  const f = formatPurity(purity);
  return f ? `${code} · ${f}` : code;
}
