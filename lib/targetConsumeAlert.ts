import { prisma } from "@/lib/prisma";
import { sendTargetConsumeWebhook } from "@/lib/targetAlertWebhook";

/**
 * 타겟 소진 알림 판정 + 발송.
 *
 * 호출 시점: target_log INSERT가 이미 커밋된 뒤.
 * 따라서 여기서 예외를 던지면 "저장은 됐는데 500 응답"이 나가므로,
 * 모든 예외를 흡수하고 콘솔 로그만 남긴다.
 */
export async function checkAndSendConsumeAlert(targetUnitId: number): Promise<void> {
  try {
    const tu = await prisma.targetUnit.findUnique({
      where: { id: targetUnitId },
      select: {
        id: true,
        status: true,
        category: true,
        consumeAlertSentG: true,
        item: {
          select: {
            code: true,
            name: true,
            targetSpec: { select: { consumeAlertG: true } },
          },
        },
        barcodes: { select: { code: true }, take: 1 },
      },
    });

    if (!tu) return;
    if (tu.category !== "sputter") return;   // ALD 캐니스터 제외
    if (tu.status === "폐기") return;         // 폐기 타겟 제외

    const alertG = tu.item?.targetSpec?.consumeAlertG;
    if (alertG == null) return;               // 감시 대상 아님
    const threshold = Number(alertG);
    if (!(threshold > 0)) return;             // 0 이하 / NaN 무효

    // 같은 기준으로 이미 발송함 → 중복 방지.
    // 기준값이 바뀌면 값이 달라지므로 자동으로 재판정된다.
    if (tu.consumeAlertSentG != null && Number(tu.consumeAlertSentG) === threshold) return;

    // 최초 / 최신 측정값 (무게 있는 '측정' 로그만)
    const [firstLog, lastLog] = await Promise.all([
      prisma.targetLog.findFirst({
        where: { targetUnitId, logType: "측정", weight: { not: null } },
        orderBy: [{ loggedAt: "asc" }, { id: "asc" }],
        select: { weight: true },
      }),
      prisma.targetLog.findFirst({
        where: { targetUnitId, logType: "측정", weight: { not: null } },
        orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
        select: { weight: true, location: { select: { name: true } } },
      }),
    ]);

    if (firstLog?.weight == null || lastLog?.weight == null) return;  // 측정 기록 없음

    const firstWeight   = Number(firstLog.weight);
    const currentWeight = Number(lastLog.weight);
    const drop = firstWeight - currentWeight;

    // 기준 미달이면 종료. 과거 데이터 중 무게가 역전된 건(음수 drop)도 여기서 걸러진다.
    if (!(drop >= threshold)) return;

    await sendTargetConsumeWebhook({
      itemCode:      tu.item?.code ?? "",
      itemName:      tu.item?.name ?? "",
      barcodeCode:   tu.barcodes[0]?.code ?? `TU-${tu.id}`,
      firstWeight,
      currentWeight,
      drop,
      threshold,
      locationName:  lastLog.location?.name ?? "",
    });

    await prisma.targetUnit.update({
      where: { id: targetUnitId },
      data: {
        consumeAlertSentAt: new Date(),
        consumeAlertSentG:  threshold,
      },
    });

    console.log(`[targetConsumeAlert] 발송 완료: TU-${targetUnitId}, 소모 ${drop.toFixed(3)}g / 기준 ${threshold}g`);
  } catch (e) {
    console.error("[targetConsumeAlert] 알림 처리 실패 (측정 저장은 정상):", e);
  }
}
