/**
 * 한국 시간(KST) 날짜·시각 유틸 — 서버·브라우저 공용, 의존성 없음.
 *
 * - DB timestamp 컬럼(target_log.logged_at, activity_log.created_at, inventory_tx.created_at,
 *   chamber_slot_log.changed_at 등)은 UTC 로 저장된다 (Prisma 7 이 @default(now()) 값을 앱에서 UTC 로 넣는다).
 *   → toISOString() 을 잘라 보여주면 9시간 늦게 보인다. 표시할 때는 formatKstDateTime / formatKstDate 를 쓴다.
 * - 날짜 전용 컬럼(@db.Date: tx_date, disposed_at, taken_date)은 Date 의 UTC 날짜 부분으로 저장된다.
 *   → new Date() 를 그대로 넣으면 KST 오전 9시 전엔 전날이 된다. '오늘'은 kstTodayDbDate() 를 넣는다.
 * - 한국은 서머타임이 없어 +9h 고정으로 계산한다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 벽시계 값을 UTC 필드에 담은 Date (getUTC* 로 읽는다) */
function toKstShifted(d: Date | string | number): Date {
  return new Date(new Date(d).getTime() + KST_OFFSET_MS);
}

/** "YYYY-MM-DD" (KST) */
export function formatKstDate(d: Date | string | number): string {
  return toKstShifted(d).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD HH:mm" (KST), seconds 면 "YYYY-MM-DD HH:mm:ss" */
export function formatKstDateTime(d: Date | string | number, opts?: { seconds?: boolean }): string {
  const iso = toKstShifted(d).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, opts?.seconds ? 19 : 16)}`;
}

/** 오늘 날짜 "YYYY-MM-DD" (KST) */
export function kstToday(): string {
  return formatKstDate(Date.now());
}

/** @db.Date 컬럼에 '오늘'을 넣을 때 쓰는 값 (KST 오늘의 UTC 자정) */
export function kstTodayDbDate(): Date {
  return new Date(`${kstToday()}T00:00:00.000Z`);
}

/** KST 하루의 시작 시각 (timestamp 컬럼 기간 조건용) */
export function kstDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+09:00`);
}

/** KST 하루의 끝 시각 (timestamp 컬럼 기간 조건용) */
export function kstDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+09:00`);
}
