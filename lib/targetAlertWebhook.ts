// 타겟 소진 알림 웹훅.
// LN2 알림과 같은 Google Chat 스페이스로 보낸다 (LN2_ALERT_WEBHOOK_URL 공용).
// lib/ln2Webhook.ts 는 손대지 않는다 — 메시지 포맷만 다른 별도 발송기.
export async function sendTargetConsumeWebhook(args: {
  itemCode: string;
  itemName: string;
  barcodeCode: string;
  firstWeight: number;
  currentWeight: number;
  drop: number;
  threshold: number;
  locationName: string;
}): Promise<void> {
  const url = process.env.LN2_ALERT_WEBHOOK_URL;
  if (!url) throw new Error("LN2_ALERT_WEBHOOK_URL 환경변수 누락");

  const f = (n: number) => n.toFixed(3);
  const text =
    `⚠️ [타겟 소진 임박] ${args.itemCode} / ${args.barcodeCode}\n` +
    `· 품목: ${args.itemName}\n` +
    `· 최초 ${f(args.firstWeight)}g → 현재 ${f(args.currentWeight)}g (소모 ${f(args.drop)}g)\n` +
    `· 기준: ${args.threshold}g 이상 소모\n` +
    (args.locationName ? `· 위치: ${args.locationName}\n` : "") +
    `교체를 준비해 주세요.`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`웹훅 전송 실패 (HTTP ${res.status}): ${body}`);
  }
}
