import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/auth-helpers";

const VALID_TYPES = ["입고", "출고", "불출", "충진 입고"];

function safeStringEqual(a: string, b: string): boolean {
  // 길이가 다르면 비교조차 하지 않음 — timingSafeEqual은 같은 길이만 허용
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * 내부 쓰기 전용 인증.
 *
 * - Authorization: Bearer <token>  → process.env.INVENTORY_WRITE_TOKEN 과 일치해야 함
 * - X-Acting-User-Email             → 행위자 식별 (쓰기는 신원 필수, 없으면 401)
 *
 * ⚠️ next-auth 세션이나 DISABLE_AUTH 우회를 타지 않음. 항상 머신 토큰을 실제로 검증.
 */
type WriteAuthResult =
  | { ok: true; actingUserId: number }
  | { ok: false; response: NextResponse };

async function requireWriteAuth(request: Request): Promise<WriteAuthResult> {
  const expected = process.env.INVENTORY_WRITE_TOKEN;

  // 토큰 자체가 서버에 설정 안 돼 있으면 절대 통과시키지 않음 (서버 설정 오류)
  if (!expected || expected.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "쓰기 토큰 미설정" },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim() ?? "";

  if (!token || !safeStringEqual(token, expected)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "인증 실패" }, { status: 401 }),
    };
  }

  // 쓰기는 신원 필수 — 헤더가 없으면 401
  const actingEmail = request.headers.get("x-acting-user-email")?.trim() || "";
  if (!actingEmail) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "행위자 이메일(x-acting-user-email)이 필요합니다." },
        { status: 401 }
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: actingEmail },
    select: { id: true, isActive: true },
  });
  if (!user || user.isActive === "N") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "행위자를 찾을 수 없거나 비활성 사용자입니다." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, actingUserId: user.id };
}

// POST /api/internal/inventory — 내부 쓰기 전용 재고 트랜잭션 생성 (토큰 + acting-user 인증)
export async function POST(request: NextRequest) {
  const authResult = await requireWriteAuth(request);
  if (!authResult.ok) {
    return authResult.response;
  }
  try {
    const actingUserId = authResult.actingUserId;

    const body = await request.json();

    // barcodeId 정규화: 챗봇은 바코드 코드 문자열(예: "T-36")을 보낼 수 있다.
    // 숫자가 아니면 barcode 테이블에서 code로 조회해 숫자 id로 치환한다.
    // (이후 모든 barcodeId 사용처가 Number(body.barcodeId)로 정수를 기대하므로 여기서 한 번에 정규화)
    if (body.barcodeId !== null && body.barcodeId !== undefined && body.barcodeId !== "") {
      const asNum = Number(body.barcodeId);
      if (Number.isNaN(asNum)) {
        // 숫자로 변환 불가 → 코드 문자열로 간주하고 code로 조회
        const foundByCode = await prisma.barcode.findFirst({
          where: { code: String(body.barcodeId) },
          select: { id: true },
        });
        if (!foundByCode) {
          return NextResponse.json(
            { error: `바코드 '${body.barcodeId}'를 찾을 수 없습니다.` },
            { status: 400 }
          );
        }
        body.barcodeId = foundByCode.id;
      } else {
        // 이미 숫자(또는 숫자 문자열) → 정수로 통일
        body.barcodeId = asNum;
      }
    }

    // 출고/불출 + 바코드가 있으면: 그 바코드에 연결된 입고 전표를 확인해 refTxNo를 결정한다.
    // 대부분의 바코드(타겟/ALD/신규 웨이퍼)는 입고전표와 1:1이지만, 레거시 데이터에는
    // 바코드 1개에 입고건이 여러 개(최대 6개) 물려 있는 경우가 있다. 이때 findFirst로
    // 최신 입고건을 골라 덮어쓰면 호출자가 명시적으로 고른 refTxNo가 조용히 뭉개진다.
    // → 입고건이 정확히 1건일 때만 덮어쓰고, 2건 이상이면 호출자가 보낸 refTxNo를 존중하되
    //   그 값이 실제로 이 바코드에 연결된 입고건인지 검증한다.
    if (
      (body.txType === "출고" || body.txType === "불출") &&
      body.barcodeId !== null &&
      body.barcodeId !== undefined &&
      body.barcodeId !== ""
    ) {
      const barcodeInbounds = await prisma.inventoryTx.findMany({
        where: { barcodeId: Number(body.barcodeId), txType: "입고" },
        orderBy: { id: "desc" },
        select: { txNo: true },
      });

      if (barcodeInbounds.length === 1) {
        // 1:1 (타겟/ALD/신규 웨이퍼 바코드) → 바코드 기준으로 강제 (기존 동작 유지)
        body.refTxNo = barcodeInbounds[0].txNo!;
      } else if (barcodeInbounds.length > 1) {
        // 레거시 다중 연결 → 자동 추측 금지. 호출자가 보낸 refTxNo를 존중하되,
        // 그 refTxNo가 실제로 이 바코드에 연결된 입고건인지 검증한다.
        const valid = barcodeInbounds.some(t => t.txNo === body.refTxNo);
        if (!body.refTxNo) {
          return NextResponse.json({
            error: `이 바코드에는 입고건이 ${barcodeInbounds.length}개 연결되어 있습니다. ` +
                   `어느 입고분에서 출고할지 refTxNo를 지정해야 합니다. ` +
                   `(후보: ${barcodeInbounds.map(t => t.txNo).join(", ")})`,
          }, { status: 400 });
        }
        if (!valid) {
          return NextResponse.json({
            error: `refTxNo(${body.refTxNo})가 이 바코드에 연결된 입고건이 아닙니다. ` +
                   `(후보: ${barcodeInbounds.map(t => t.txNo).join(", ")})`,
          }, { status: 400 });
        }
        // valid → body.refTxNo 그대로 사용 (덮어쓰지 않음)
      }
      // length === 0 → 아무것도 안 함. 아래 기존 검증 로직이 처리
    }

    if (!body.txType || !VALID_TYPES.includes(body.txType)) {
      return NextResponse.json({ error: "구분은 입고/출고/불출 중 하나여야 합니다." }, { status: 400 });
    }
    const isOutbound = body.txType === "출고" || body.txType === "불출";
    // 출고/불출은 refTxNo로 품목/위치를 자동 결정할 수 있으므로 itemId/locationId 필수검증을 뒤로 미룸
    if (!isOutbound && !body.itemId) {
      return NextResponse.json({ error: "품목을 선택해주세요." }, { status: 400 });
    }
    if (!body.qty || Number(body.qty) <= 0) {
      return NextResponse.json({ error: "수량은 1 이상이어야 합니다." }, { status: 400 });
    }
    if (!body.txDate || isNaN(new Date(body.txDate).getTime())) {
      return NextResponse.json({ error: "유효한 날짜를 입력해주세요." }, { status: 400 });
    }
    if (!isOutbound && !body.locationId) {
      return NextResponse.json({ error: "위치를 선택해주세요." }, { status: 400 });
    }
    if (isOutbound && !body.refTxNo) {
      return NextResponse.json({ error: "출고/불출 시 참조 입고 전표번호가 필요합니다." }, { status: 400 });
    }

    // 출고/불출: refTxNo의 참조 입고건에서 품목/위치 자동 결정
    if (isOutbound && body.refTxNo) {
      const ref = await prisma.inventoryTx.findUnique({
        where: { txNo: body.refTxNo },
        select: { itemId: true, locationId: true, txType: true },
      });
      if (!ref) {
        return NextResponse.json({ error: "참조 입고 전표를 찾을 수 없습니다." }, { status: 400 });
      }
      if (ref.txType !== "입고" && ref.txType !== "충진 입고") {
        return NextResponse.json({ error: "참조 전표가 입고 건이 아닙니다." }, { status: 400 });
      }
      // 출고/불출은 refTxNo(입고분)가 품목/위치의 진실. gemma가 보낸 itemId/locationId는
      // 신뢰하지 않고 무조건 참조 입고분 값으로 덮어쓴다. (LLM이 가짜 itemId를 채워 보내도 안전)
      body.itemId = ref.itemId;
      body.locationId = ref.locationId;
    }

    // 출고/불출 시 바코드 연결 품목 검증
    if ((body.txType === "출고" || body.txType === "불출") && !body.barcodeId) {
      const barcodeCount = await prisma.barcode.count({
        where: { itemId: Number(body.itemId), isActive: "Y" },
      });
      if (barcodeCount > 0) {
        return NextResponse.json(
          { error: "해당 품목은 바코드 스캔이 필요합니다." },
          { status: 400 }
        );
      }
    }

    // 바코드와 품목 불일치 검증
    if (body.barcodeId) {
      const barcode = await prisma.barcode.findUnique({
        where: { id: Number(body.barcodeId) },
        select: { itemId: true, targetUnit: { select: { itemId: true } } },
      });
      const barcodeItemId = barcode?.itemId ?? barcode?.targetUnit?.itemId;
      if (barcodeItemId && barcodeItemId !== Number(body.itemId)) {
        return NextResponse.json(
          { error: "바코드와 품목이 일치하지 않습니다." },
          { status: 400 }
        );
      }
    }

    // 바코드 중복 입고 방지 (전 카테고리, 바코드=입고 로트 1:1)
    if (body.txType === "입고" && body.barcodeId) {
      const barcode = await prisma.barcode.findUnique({
        where: { id: Number(body.barcodeId) },
        select: { code: true },
      });
      if (barcode) {
        const existingInbound = await prisma.inventoryTx.findFirst({
          where: { barcodeId: Number(body.barcodeId), txType: "입고" },
          select: { txNo: true },
        });
        if (existingInbound) {
          return NextResponse.json(
            { error: `해당 바코드(${barcode.code})는 이미 입고 전표 ${existingInbound.txNo}에 사용되었습니다. 새 입고에는 [생성] 버튼으로 새 바코드를 만드세요.` },
            { status: 400 }
          );
        }
      }
    }

    // 입고 시 바코드/타겟유닛 필수 검증 (카테고리별)
    // 바코드 필수: 타겟 / ALD Canister / 웨이퍼 (입고 로트 1:1)
    // targetUnit 연결 필수: 타겟 / ALD Canister 전용 (웨이퍼는 targetUnitId=null이므로 제외)
    if (body.txType === "입고") {
      const item = await prisma.item.findUnique({
        where: { id: Number(body.itemId) },
        include: { category: true },
      });
      const catName = item?.category?.name;
      const needsBarcode    = catName === "타겟" || catName === "ALD Canister" || catName === "웨이퍼";
      const needsTargetUnit = catName === "타겟" || catName === "ALD Canister";

      // 바코드 없이 입고 시도 차단
      if (needsBarcode && !body.barcodeId) {
        return NextResponse.json(
          { error: `${catName} 품목은 반드시 바코드를 생성/스캔하여 입고해야 합니다.` },
          { status: 400 }
        );
      }
      // 바코드는 있지만 targetUnitId가 없는 경우 (타겟/ALD 전용, 웨이퍼는 여기 안 들어옴)
      if (needsTargetUnit && !body.targetUnitId) {
        const barcode = await prisma.barcode.findUnique({
          where: { id: Number(body.barcodeId) },
          select: { targetUnitId: true, code: true },
        });
        if (!barcode?.targetUnitId) {
          return NextResponse.json(
            { error: `바코드(${barcode?.code})에 연결된 정보가 없습니다. 바코드를 다시 생성해주세요.` },
            { status: 400 }
          );
        }
      }
    }

    // 출고/불출 수량 초과 방지
    if ((body.txType === "출고" || body.txType === "불출") && body.refTxNo) {
      const refInbound = await prisma.inventoryTx.findUnique({
        where: { txNo: body.refTxNo },
        select: { qty: true, itemId: true, locationId: true, txType: true },
      });
      if (refInbound) {
        // 참조 입고 무결성 검증: 입고 타입 / 품목 / 위치 일치
        if (refInbound.txType !== "입고" && refInbound.txType !== "충진 입고") {
          return NextResponse.json(
            { error: "참조 전표가 입고 건이 아닙니다." },
            { status: 400 }
          );
        }
        if (refInbound.itemId !== Number(body.itemId)) {
          return NextResponse.json(
            { error: "참조 입고 건의 품목과 출고 품목이 일치하지 않습니다." },
            { status: 400 }
          );
        }
        if (refInbound.locationId !== Number(body.locationId)) {
          return NextResponse.json(
            { error: "참조 입고 건의 위치와 출고 위치가 일치하지 않습니다." },
            { status: 400 }
          );
        }
        const consumed = await prisma.inventoryTx.aggregate({
          where: {
            refTxNo: body.refTxNo,
            txType: { in: ["출고", "불출"] },
          },
          _sum: { qty: true },
        });
        const usedQty = consumed._sum.qty ?? 0;
        const remainQty = refInbound.qty - usedQty;
        if (Number(body.qty) > remainQty) {
          return NextResponse.json(
            { error: `수량 초과: 해당 입고건의 잔여수량은 ${remainQty}개입니다. (요청: ${body.qty}개)` },
            { status: 400 }
          );
        }
      }
    }

    // 전표번호 자동 채번: 숫자형 tx_no 중 가장 큰 값 + 1
    const allTxNos = await prisma.inventoryTx.findMany({
      where: { txNo: { not: null } },
      select: { txNo: true },
    });
    const lastNo = allTxNos.reduce((max, tx) => {
      const num = parseInt(tx.txNo ?? "", 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    const newTxNo = String(lastNo + 1);

    // 출고/불출 시 참조 입고 건 가격 자동 복사
    let resolvedUnitPrice = body.unitPrice || null;
    let resolvedAmount = body.amount || null;
    let resolvedCurrency = body.currency ?? "KRW";
    let resolvedExchangeRate = body.currency === "USD" ? (body.exchangeRateAtEntry ?? null) : null;

    if ((body.txType === "출고" || body.txType === "불출") && body.refTxNo) {
      const refTx = await prisma.inventoryTx.findUnique({
        where:  { txNo: body.refTxNo },
        select: { unitPrice: true, amount: true, currency: true, exchangeRateAtEntry: true, qty: true, locationId: true },
      });
      if (refTx && refTx.locationId !== Number(body.locationId)) {
        return NextResponse.json(
          { error: `입고 위치(${refTx.locationId === 1 ? "본사" : "공덕"})와 출고 위치가 다릅니다. 입고된 위치에서만 출고/불출이 가능합니다.` },
          { status: 400 }
        );
      }
      if (refTx) {
        resolvedCurrency = refTx.currency ?? "KRW";
        resolvedExchangeRate = refTx.exchangeRateAtEntry != null ? Number(refTx.exchangeRateAtEntry) : null;
        if (refTx.unitPrice != null) {
          resolvedUnitPrice = Number(refTx.unitPrice);
          resolvedAmount = Number(refTx.unitPrice) * Number(body.qty);
        }
      }
    }

    // 불출처 처리: disburseeUserId로 user 조회 후 partner 매칭
    let finalPartnerId = body.txType === "불출" ? null : (body.partnerId || null);
    if (body.txType === "불출" && body.disburseeUserId) {
      const disburseeUser = await prisma.user.findUnique({
        where: { id: Number(body.disburseeUserId) },
        select: { name: true },
      });
      if (disburseeUser) {
        const matchedPartner = await prisma.partner.findFirst({
          where: { name: disburseeUser.name },
        });
        finalPartnerId = matchedPartner?.id ?? null;
      }
    }

    const tx = await prisma.inventoryTx.create({
      data: {
        txNo:         newTxNo,
        txDate:       new Date(body.txDate),
        txType:       body.txType,
        itemId:       Number(body.itemId),
        qty:          Number(body.qty),
        unitPrice:           resolvedUnitPrice,
        amount:              resolvedAmount,
        partnerId:    finalPartnerId,
        txReasonId:   body.txReasonId   || null,
        locationId:   Number(body.locationId),
        userId:       actingUserId ?? null,
        memo:         body.memo         || null,
        targetUnitId: body.targetUnitId || null,
        barcodeId:    body.barcodeId    || null,
        refTxNo:      body.refTxNo      || null,
        currency:            resolvedCurrency,
        exchangeRateAtEntry: resolvedExchangeRate,
      },
    });

    // 충진 입고 시: ald_canister_spec 물질명 업데이트
    if (body.txType === "충진 입고" && body.barcodeId) {
      const fillBc = await prisma.barcode.findUnique({
        where:  { id: Number(body.barcodeId) },
        select: { targetUnitId: true },
      });
      if (fillBc?.targetUnitId) {
        await prisma.aldCanisterSpec.updateMany({
          where: { targetUnitId: fillBc.targetUnitId },
          data:  {
            materialName:       body.aldMaterialName || null,
            initialGrossWeight: body.aldInitialGross
              ? Number(body.aldInitialGross) : undefined,
            updatedAt: new Date(),
          },
        });
        await prisma.targetUnit.update({
          where: { id: fillBc.targetUnitId },
          data:  { status: "사용중" },
        });

        // 충진 입고 → target_log + ald_log_detail 생성 (ALD 탭 이력에 표시)
        const allTxNosForLog = await prisma.inventoryTx.findMany({
          where: { txNo: { not: null } },
          select: { txNo: true },
        });
        const lastNoForLog = allTxNosForLog.reduce((max, t) => {
          const n = parseInt(t.txNo ?? "", 10);
          return isNaN(n) ? max : Math.max(max, n);
        }, 0);

        const fillLog = await prisma.targetLog.create({
          data: {
            targetUnitId: fillBc.targetUnitId,
            logType:      "측정",
            loggedAt:     new Date(),
            userId:       actingUserId ?? null,
          },
        });

        const fillSpec = await prisma.aldCanisterSpec.findUnique({
          where: { targetUnitId: fillBc.targetUnitId },
        });

        await prisma.aldLogDetail.create({
          data: {
            targetLogId:        fillLog.id,
            logSubType:         "충진",
            materialName:       body.aldMaterialName || null,
            grossWeight:        body.aldInitialGross
              ? Number(body.aldInitialGross) : null,
            tareWeight:         fillSpec?.tareWeight
              ? Number(fillSpec.tareWeight) : null,
            measureWeight:      null,
            cumulativeCycle:    null,
            consumptionPerCycle: null,
            remainPercent:      100,
            estimatedRemainCycle: null,
          },
        });
      }
    }

    // 출고 시: 타겟이 미사용 상태이면 판매완료로 자동 전이
    if (body.txType === "출고" && body.barcodeId) {
      const bc = await prisma.barcode.findUnique({
        where: { id: Number(body.barcodeId) },
        select: { targetUnitId: true },
      });
      if (bc?.targetUnitId) {
        const tu = await prisma.targetUnit.findUnique({
          where: { id: bc.targetUnitId },
          select: { status: true },
        });
        if (tu?.status === "미사용") {
          await prisma.targetUnit.update({
            where: { id: bc.targetUnitId },
            data: { status: "판매완료" },
          });
        }
      }
    }

    // 불출 시: ALD Canister이면 폐기 자동 처리 + 포트 슬롯 비우기
    if (body.txType === "불출" && body.barcodeId) {
      const bc = await prisma.barcode.findUnique({
        where: { id: Number(body.barcodeId) },
        include: {
          item: { include: { category: true } },
          targetUnit: true,
        },
      });
      if (bc?.item?.category?.name === "ALD Canister" && bc.targetUnitId) {
        // 상태 → 폐기
        await prisma.targetUnit.update({
          where: { id: bc.targetUnitId },
          data: { status: "폐기", disposedAt: new Date() },
        });
        // 바코드 비활성화
        await prisma.barcode.update({
          where: { id: Number(body.barcodeId) },
          data: { isActive: "N" },
        });
        // 포트 슬롯 자동 비우기
        await prisma.aldPortSlot.updateMany({
          where: { targetUnitId: bc.targetUnitId },
          data: { targetUnitId: null, loadedAt: null },
        });
      }
    }

    // activity_log 기록
    await logActivity(actingUserId, "CREATE", "inventory_tx", tx.id);

    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    console.error("POST /api/internal/inventory error:", error);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
