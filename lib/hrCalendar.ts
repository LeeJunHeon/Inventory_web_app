/**
 * vanam-hr calendar-syncer에 캘린더 일정 등록 요청.
 * 실패 시 throw — 호출자가 try-catch로 처리 (슬롯 저장에는 영향 없음).
 *
 * @param title 캘린더 일정 제목 (완성된 문자열, 그대로 사용됨)
 * @param startDate YYYY-MM-DD
 * @param endDate YYYY-MM-DD (startDate와 같으면 하루짜리)
 * @returns 생성된 Google Calendar event id
 */
export async function createHrCalendarEvent(
  title: string,
  startDate: string,
  endDate: string
): Promise<string> {
  const baseUrl = process.env.HR_CALENDAR_SYNCER_URL;
  const token = process.env.INTERNAL_API_TOKEN;

  if (!baseUrl) throw new Error("HR_CALENDAR_SYNCER_URL 환경변수 누락");
  if (!token) throw new Error("INTERNAL_API_TOKEN 환경변수 누락");

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!title || !title.trim()) throw new Error("title이 비어있음");
  if (!dateRe.test(startDate) || !dateRe.test(endDate)) {
    throw new Error("날짜 형식 오류 (YYYY-MM-DD 필요)");
  }

  const url = `${baseUrl}/internal/calendar-event`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": token,
    },
    body: JSON.stringify({ title, startDate, endDate }),
    signal: AbortSignal.timeout(10_000), // HR 무응답 시 슬롯 저장이 멎지 않도록
  });

  const data = await res
    .json()
    .catch(() => ({ ok: false, error: "응답 파싱 실패" }));

  if (!res.ok || !data.ok) {
    throw new Error(
      `HR 캘린더 등록 실패 (HTTP ${res.status}): ${data.error || "알 수 없는 오류"}`
    );
  }

  return data.eventId as string;
}
