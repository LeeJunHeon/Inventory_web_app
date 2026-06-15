import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/auth-helpers";

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

// POST /api/internal/ald-log — 챗봇용 ALD 캐니스터 "측정" 기록 (토큰 + acting-user 인증)
// 기존 app/api/ald/logs/route.ts의 POST 로직을 복제. barcodeId(코드/숫자) → canisterId(targetUnitId) 변환.
export async function POST(request: NextRequest) {
  const authResult = await requireWriteAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const actingUserId = authResult.actingUserId;
    const body = await request.json();

    // ── barcodeId 정규화: 코드 문자열("C-32")이면 숫자 id로 치환 (inventory POST와 동일 패턴) ──
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

    // ── barcodeId → canisterId(targetUnitId) 조회 ──
    const barcode = await prisma.barcode.findUnique({
      where: { id: barcodeId },
      select: { targetUnitId: true, isActive: true },
    });
    if (!barcode || !barcode.targetUnitId) {
      return NextResponse.json({ error: "바코드에 연결된 캐니스터를 찾을 수 없습니다." }, { status: 400 });
    }
    if (barcode.isActive === "N") {
      return NextResponse.json({ error: "비활성화된 바코드입니다." }, { status: 400 });
    }
    const canisterId = barcode.targetUnitId;

    // measureWeight 필수
    if (body.measureWeight == null) {
      return NextResponse.json({ error: "measureWeight는 필수입니다." }, { status: 400 });
    }

    // Canister spec 조회 (tare, initialGross). spec 없으면(=스퍼터 타겟 등) 거부됨.
    const spec = await prisma.aldCanisterSpec.findUnique({
      where: { targetUnitId: canisterId },
    });
    if (!spec) {
      return NextResponse.json({ error: "Canister 정보를 찾을 수 없습니다. (ALD 캐니스터가 아닐 수 있습니다.)" }, { status: 404 });
    }

    const measure     = Number(body.measureWeight);
    const tare        = Number(spec.tareWeight);
    const initialPure = spec.initialGrossWeight
                          ? Number(spec.initialGrossWeight) - tare
                          : measure;

    const curCycle = body.cumulativeCycle ? Number(body.cumulativeCycle) : null;

    const remainPercent = initialPure > 0
      ? (measure / initialPure) * 100 : null;

    const estimatedRemainCycle = (curCycle && measure > 0 && initialPure > measure)
      ? Math.round(measure * curCycle / (initialPure - measure)) : null;

    const slotId = body.slotId ? Number(body.slotId) : null;
    const locationId = body.locationId ? Number(body.locationId) : null;

    const saved = await prisma.$transaction(async (tx) => {
      // target_log 저장
      const log = await tx.targetLog.create({
        data: {
          targetUnitId: canisterId,
          logType:      "측정",
          weight:       measure,
          locationId:   locationId,
          reason:       body.reason || null,
          userId:       actingUserId ?? null,
        },
      });

      // ald_log_detail 저장
      await tx.aldLogDetail.create({
        data: {
          targetLogId:          log.id,
          logSubType:           "측정",
          materialName:         body.materialName || spec.materialName || null,
          grossWeight:          spec.initialGrossWeight ? Number(spec.initialGrossWeight) : null,
          tareWeight:           tare,
          measureWeight:        measure,
          cumulativeCycle:      curCycle,
          consumptionPerCycle:  body.consumptionPerCycle ? Number(body.consumptionPerCycle) : null,
          remainPercent:        remainPercent,
          estimatedRemainCycle: estimatedRemainCycle,
          locationId:           locationId,
        },
      });

      // slotId가 있으면 해당 포트에 canister 자동 배정
      if (slotId) {
        await tx.aldPortSlot.updateMany({
          where: { targetUnitId: canisterId, id: { not: slotId } },
          data:  { targetUnitId: null, loadedAt: null },
        });
        await tx.aldPortSlot.update({
          where: { id: slotId },
          data:  { targetUnitId: canisterId, loadedAt: new Date() },
        });
      }

      // locationId가 있으면 ald_port_slot 위치 자동 업데이트
      if (locationId) {
        await tx.aldPortSlot.updateMany({
          where: { targetUnitId: canisterId },
          data:  { loadedAt: new Date() },
        });
      }

      return log;
    });

    await logActivity(actingUserId, "CREATE", "target_log", saved.id,
      `ALD 측정: measure=${measure.toFixed(3)}g`);

    return NextResponse.json({ id: saved.id, canisterId, message: "측정이 기록되었습니다." }, { status: 201 });
  } catch (error) {
    console.error("POST /api/internal/ald-log error:", error);
    return NextResponse.json({ error: "측정 기록 실패", detail: String(error) }, { status: 500 });
  }
}
