// ALD 포트 배정 규칙. 서버(route)와 화면(AldPrecursorPage)이 함께 쓰므로 prisma 등 서버 전용 모듈은 import 하지 않는다.

/** 포트에 배정할 수 없는 Canister 상태 (TargetUnit.status). 배정하면 포트에 장착된 것으로 보이므로 막는다. */
export const UNASSIGNABLE_STATUSES: readonly string[] = ["폐기", "판매완료"];

/** 이 상태의 Canister 를 포트에 배정할 수 있는지 (상태 값이 없으면 판단할 수 없으므로 불가) */
export function isPortAssignable(status: string | null | undefined): boolean {
  return !!status && !UNASSIGNABLE_STATUSES.includes(status);
}

/** 양의 정수(숫자 또는 숫자 문자열)면 그 값, 아니면 null — slotId·canisterId 입력 검증용 */
export function parsePositiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v
    : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim())
    : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
