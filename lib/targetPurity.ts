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
