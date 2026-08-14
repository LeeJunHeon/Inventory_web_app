import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/auth-helpers";
import { buildTargetLogDetail } from "@/lib/logDetail";
import { checkAndSendConsumeAlert } from "@/lib/targetConsumeAlert";

function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

type WriteAuthResult =
  | { ok: true; actingUserId: number }
  | { ok: false; response: NextResponse };

// app/api/internal/inventory/route.ts와 동일한 쓰기 전용 인증
async function requireWriteAuth(request: Request): Promise<WriteAuthResult> {
  const expected = process.env.INVENTORY_WRITE_TOKEN;
  if (!expected || expected.length === 0) {
    return { ok: false, response: NextResponse.json({ error: "쓰기 토큰 미설정" }, { status: 500 }) };
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim() ?? "";
  if (!token || !safeStringEqual(token, expected)) {
    return { ok: false, response: NextResponse.json({ error: "인증 실패" }, { status: 401 }) };
  }
  const actingEmail = request.headers.get("x-acting-user-email")?.trim() || "";
  if (!actingEmail) {
    return { ok: false, response: NextResponse.json({ error: "행위자 이메일(x-acting-user-email)이 필요합니다." }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { email: actingEmail },
    select: { id: true, isActive: true },
  });
  if (!user || user.isActive === "N") {
    return { ok: false, response: NextResponse.json({ error: "행위자를 찾을 수 없거나 비활성 사용자입니다." }, { status: 403 }) };
  }
  return { ok: true, actingUserId: user.id };
}

// POST /api/internal/target-log — 챗봇용 스퍼터 타겟 "측정" 기록 (토큰 + acting-user 인증)
// 기존 app/api/targets/route.ts의 측정 로직을 복제. barcodeId(코드/숫자) → targetUnitId 변환.
export async function POST(request: NextRequest) {
  const authResult = await requireWriteAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const actingUserId = authResult.actingUserId;
    const body = await request.json();

    // ── barcodeId 정규화: 코드 문자열("T-36")이면 숫자 id로 치환 (inventory POST와 동일 패턴) ──
    let barcodeId: number | null = null;
    if (body.barcodeId !== null && body.barcodeId !== undefined && body.barcodeId !== "") {
      const asNum = Number(body.barcodeId);
      if (Number.isNaN(asNum)) {
        const foundByCode = await prisma.barcode.findFirst({
          where: { code: String(body.barcodeId) },
          select: { id: true },
        });
        if (!foundByCode) {
          return NextResponse.json({ error: `바코드 '${body.barcodeId}'를 찾을 수 없습니다.` }, { status: 400 });
        }
        barcodeId = foundByCode.id;
      } else {
        barcodeId = asNum;
      }
    }
    if (!barcodeId) {
      return NextResponse.json({ error: "바코드가 필요합니다." }, { status: 400 });
    }

    // ── barcodeId → targetUnitId 조회 (스퍼터 타겟이어야 함) ──
    const barcode = await prisma.barcode.findUnique({
      where: { id: barcodeId },
      select: { targetUnitId: true, isActive: true },
    });
    if (!barcode || !barcode.targetUnitId) {
      return NextResponse.json({ error: "바코드에 연결된 타겟을 찾을 수 없습니다." }, { status: 400 });
    }
    if (barcode.isActive === "N") {
      return NextResponse.json({ error: "비활성화된 바코드입니다." }, { status: 400 });
    }
    const targetUnitId = barcode.targetUnitId;

    const logType = "측정"; // 이 엔드포인트는 측정만 처리

    // ── 보관함→챔버 이동이면 무게 생략 가능 (기존 targets 로직과 동일) ──
    const STORAGE_IDS = [3, 4];
    const CHAMBER_IDS = [5, 6, 7, 8, 9, 10];

    const lastLocLog = await prisma.targetLog.findFirst({
      where: { targetUnitId },
      orderBy: { loggedAt: "desc" },
      select: { locationId: true },
    });
    const prevLocationId = lastLocLog?.locationId ?? null;
    const currLocationId = body.locationId ? Number(body.locationId) : null;
    const isStorageToChamber =
      prevLocationId !== null &&
      currLocationId !== null &&
      STORAGE_IDS.includes(prevLocationId) &&
      CHAMBER_IDS.includes(currLocationId);
    const weightRequired = !isStorageToChamber;

    if (weightRequired && body.weight == null) {
      return NextResponse.json({ error: "무게를 입력해주세요." }, { status: 400 });
    }

    // ── 무게 하락 검증: 새 무게가 직전 측정값보다 높으면 차단 (기존 로직과 동일) ──
    if (body.weight != null) {
      const newWeight = Number(body.weight);
      const lastLog = await prisma.targetLog.findFirst({
        where: { targetUnitId, logType: "측정", weight: { not: null } },
        orderBy: { loggedAt: "desc" },
        select: { weight: true },
      });
      if (lastLog?.weight != null) {
        const prevWeight = Number(lastLog.weight);
        if (newWeight > prevWeight) {
          return NextResponse.json(
            { error: `입력한 무게(${newWeight.toFixed(3)}g)가 이전 측정값(${prevWeight.toFixed(3)}g)보다 높습니다. 다시 확인해주세요.` },
            { status: 400 }
          );
        }
      }
    }

    // ── target_log 생성 ──
    const log = await prisma.targetLog.create({
      data: {
        targetUnitId,
        logType,
        weight: body.weight ?? null,
        locationId: body.locationId ? Number(body.locationId) : null,
        reason: body.reason || null,
        userId: actingUserId ?? null,
      },
    });

    // ── 미사용 → 사용중 자동 전이 + inventory_tx 자동 기록 (스퍼터만, 기존 로직과 동일) ──
    const tu = await prisma.targetUnit.findUnique({
      where: { id: targetUnitId },
      select: { status: true, itemId: true, category: true },
    });
    if (tu && tu.category !== "sputter") {
      return NextResponse.json(
        { error: "ALD Canister는 타겟 사용현황(측정) API를 사용할 수 없습니다." },
        { status: 400 }
      );
    }
    // 챔버로 장착하는 측정일 때만 전이 (보관함/위치 미전달은 계측만 기록)
    const isChamberMeasure = currLocationId !== null && CHAMBER_IDS.includes(currLocationId);
    if (tu?.status === "미사용" && isChamberMeasure) {
      await prisma.$transaction(async (tx) => {
        await tx.targetUnit.update({
          where: { id: targetUnitId },
          data: { status: "사용중" },
        });
        const bc = await tx.barcode.findFirst({
          where: { targetUnitId, isActive: "Y" },
          select: { id: true },
        });
        // 이 바코드의 입고 전표를 참조로 걸어 로트 잔여를 소진시킨다 (장착 타겟 오출고 차단)
        const inboundTx = bc
          ? await tx.inventoryTx.findFirst({
              where: { barcodeId: bc.id, txType: "입고" },
              select: { txNo: true, locationId: true },
            })
          : null;
        const allTxNos = await tx.inventoryTx.findMany({
          where: { txNo: { not: null } },
          select: { txNo: true },
        });
        const lastNo = allTxNos.reduce((max, t) => {
          const n = Number(t.txNo);
          return !isNaN(n) && n > max ? n : max;
        }, 0);
        const newTxNo = String(lastNo + 1);
        await tx.inventoryTx.create({
          data: {
            txNo: newTxNo,
            txType: "사용중",
            txDate: new Date(),
            itemId: tu.itemId!,
            targetUnitId,
            barcodeId: bc?.id ?? null,
            // 재고 원장은 재고가 있던 위치에서 차감돼야 위치별 집계가 맞는다
            locationId: inboundTx?.locationId ?? 1,
            qty: 1,
            userId: actingUserId,
            refTxNo: inboundTx?.txNo ?? null,
            memo: "타겟 사용 시작 - 자동 기록",
          },
        });
      });
    }

    // ── chamber_slot 자동 업데이트 + 이력 (기존 로직과 동일) ──
    const newLocationId = body.locationId ? Number(body.locationId) : null;
    if (newLocationId && CHAMBER_IDS.includes(newLocationId)) {
      const existingSlot = await prisma.chamberSlot.findFirst({
        where: { locationId: newLocationId },
        select: { targetUnitId: true },
      });
      const previousTargetUnitId = existingSlot?.targetUnitId ?? null;
      if (previousTargetUnitId !== targetUnitId) {
        await prisma.chamberSlot.updateMany({
          where: { locationId: newLocationId },
          data: { targetUnitId, loadedAt: new Date() },
        });
        await prisma.chamberSlotLog.create({
          data: {
            locationId: newLocationId,
            targetUnitId,
            previousTargetUnitId,
            action: previousTargetUnitId == null ? "load" : "swap",
            changedById: actingUserId ?? null,
            note: "측정 저장으로 자동 변경",
          },
        });
      }
    } else if (newLocationId && STORAGE_IDS.includes(newLocationId)) {
      const slotsToUnload = await prisma.chamberSlot.findMany({
        where: { targetUnitId },
        select: { locationId: true },
      });
      if (slotsToUnload.length > 0) {
        await prisma.chamberSlot.updateMany({
          where: { targetUnitId },
          data: { targetUnitId: null, loadedAt: null },
        });
        for (const s of slotsToUnload) {
          await prisma.chamberSlotLog.create({
            data: {
              locationId: s.locationId,
              targetUnitId: null,
              previousTargetUnitId: targetUnitId,
              action: "unload",
              changedById: actingUserId ?? null,
              note: "보관함 이동으로 자동 비움",
            },
          });
        }
      }
    }

    await logActivity(actingUserId, "CREATE", "target_log", log.id, await buildTargetLogDetail(log.id));

    // 타겟 소진 알림 — 이 엔드포인트는 측정만 처리하므로 조건 불필요
    await checkAndSendConsumeAlert(targetUnitId);

    return NextResponse.json({ id: log.id, targetUnitId, message: "측정이 기록되었습니다." }, { status: 201 });
  } catch (error) {
    console.error("POST /api/internal/target-log error:", error);
    return NextResponse.json({ error: "측정 기록 실패", detail: String(error) }, { status: 500 });
  }
}
