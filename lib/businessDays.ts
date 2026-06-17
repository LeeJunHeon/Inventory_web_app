const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Asia/Seoul 기준 오늘 날짜 'YYYY-MM-DD' (서버 TZ와 무관) */
export function todayKST(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** start로부터 n 영업일(주말 + holidays 제외) 뒤 날짜를 'YYYY-MM-DD'로 반환 */
export function addBusinessDays(start: string | Date, n: number, holidays: string[] = []): string {
  let cur = parseYmd(typeof start === "string" ? start : toYmd(start));
  const holiday = new Set(holidays);
  let added = 0;
  while (added < n) {
    cur = new Date(cur.getTime() + DAY_MS);
    const dow = cur.getUTCDay(); // 0=일, 6=토
    if (dow === 0 || dow === 6) continue;
    if (holiday.has(toYmd(cur))) continue;
    added++;
  }
  return toYmd(cur);
}
