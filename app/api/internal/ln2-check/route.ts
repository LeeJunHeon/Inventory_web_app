import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalAuth } from "@/lib/internal-auth";
import { addBusinessDays, todayKST } from "@/lib/businessDays";
import { getHrHolidays } from "@/lib/hrHolidays";
import { sendLn2Webhook } from "@/lib/ln2Webhook";

const DEFAULT_BUSINESS_DAYS = 7;

export async function POST(request: Request) {
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return auth.response;

  // 감시 대상(monitor_volume_days 설정됨)의 '가장 최근 입고' 1건
  // → 새 입고가 들어오면 이 건이 바뀌어 기한이 자동 리셋됨
  const latest = await prisma.inventoryTx.findFirst({
    where: { txType: "입고", item: { monitorVolumeDays: { not: null } } },
    orderBy: [{ txDate: "desc" }, { id: "desc" }],
    select: { txDate: true, item: { select: { name: true, monitorVolumeDays: true } } },
  });

  if (!latest) {
    return NextResponse.json({ ok: true, sent: false, reason: "감시 대상 입고 없음" });
  }

  const days = latest.item.monitorVolumeDays ?? DEFAULT_BUSINESS_DAYS;
  const inboundYmd = latest.txDate.toISOString().slice(0, 10);

  // 입고일 ~ +30일 공휴일을 hr.holidays에서 읽어 반영 (실패 시 주말만 반영)
  const toYmd = new Date(Date.parse(inboundYmd) + 30 * 86400000).toISOString().slice(0, 10);
  let holidays: string[] = [];
  let holidayReadFailed = false;
  try {
    holidays = await getHrHolidays(inboundYmd, toYmd);
  } catch (e) {
    holidayReadFailed = true;
    console.error("hr.holidays 조회 실패, 주말만 반영:", e);
  }

  const dueDate = addBusinessDays(latest.txDate, days, holidays);
  const today = todayKST();

  if (today < dueDate) {
    return NextResponse.json({ ok: true, sent: false, dueDate, today, holidayReadFailed });
  }

  // 기한 도달/경과 → 웹훅 발사 (새 입고 전까지 매일 1회 반복)
  await sendLn2Webhook({ itemName: latest.item.name, inboundDate: inboundYmd, dueDate });
  return NextResponse.json({ ok: true, sent: true, dueDate, today, holidayReadFailed });
}
