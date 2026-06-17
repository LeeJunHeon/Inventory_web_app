export async function sendLn2Webhook(args: {
  itemName: string;
  inboundDate: string; // YYYY-MM-DD
  dueDate: string;     // YYYY-MM-DD
}): Promise<void> {
  const url = process.env.LN2_ALERT_WEBHOOK_URL;
  if (!url) throw new Error("LN2_ALERT_WEBHOOK_URL 환경변수 누락");

  const text =
    `⚠️ [재고 알림] ${args.itemName} 용량 확인 필요\n` +
    `· 입고일: ${args.inboundDate}\n` +
    `· 확인 기한(7영업일): ${args.dueDate} 경과\n` +
    `오늘 용량을 측정해 주세요.`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }), // Slack/Dooray=={text}. Discord면 {content: text}로 바꿀 것
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`웹훅 전송 실패 (HTTP ${res.status}): ${body}`);
  }
}
