import { prisma } from "@/lib/prisma";

/** 같은 inventory DB의 hr.holidays(근태관리가 구글 공휴일 캘린더에서 자동 동기화)에서
 *  from~to 범위 공휴일을 'YYYY-MM-DD' 배열로 반환. to_char로 타임존 영향 차단. */
export async function getHrHolidays(fromYmd: string, toYmd: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ d: string }[]>`
    SELECT to_char(holiday_date, 'YYYY-MM-DD') AS d
    FROM hr.holidays
    WHERE holiday_date BETWEEN ${fromYmd}::date AND ${toYmd}::date
    ORDER BY holiday_date
  `;
  return rows.map((r) => r.d);
}
