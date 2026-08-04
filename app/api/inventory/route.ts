import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser, getSessionUserId, logActivity } from "@/lib/auth-helpers";
import { buildInventoryTxDetail, formatInventoryTxDetail, inventoryTxHeader } from "@/lib/logDetail";
import { LOT_CONSUME_TYPES, recordAutoTransition, resolveAutoTransitionRevert } from "@/lib/txTypes";

function buildItemSpec(ws: {
  waferType?: string | null; diameterInch?: number | null;
  resistivity?: string | null; thicknessNote?: string | null;
  orientation?: string | null; surface?: string | null;
} | null): string | null {
  if (!ws) return null;
  const parts = [
    ws.diameterInch  ? `${ws.diameterInch}"` : null,
    ws.waferType     ? `${ws.waferType}` : null,
    ws.resistivity   ? `저항: ${ws.resistivity}` : null,
    ws.thicknessNote ? `두께: ${ws.thicknessNote}` : null,
    ws.orientation   ? `방향: ${ws.orientation}` : null,
    ws.surface       ? `표면: ${ws.surface}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : null;
}

const VALID_TYPES = ["입고", "출고", "불출", "충진 입고", "사용중", "폐기"];

/** activity_log.snapshot 에 굳혀 둘 inventory_tx 스칼라 컬럼 전체 */
function txRowSnapshot(row: {
  id: number; txNo: string | null; txDate: Date; txType: string;
  itemId: number; targetUnitId: number | null; qty: number;
  unitPrice: unknown; amount: unknown; partnerId: number | null;
  txReasonId: number | null; locationId: number | null; userId: number | null;
  memo: string | null; refTxNo: string | null; barcodeId: number | null;
  currency: string | null; exchangeRateAtEntry: unknown; createdAt: Date | null;
}): Record<string, unknown> {
  return {
    id: row.id, txNo: row.txNo, txDate: row.txDate, txType: row.txType,
    itemId: row.itemId, targetUnitId: row.targetUnitId, qty: row.qty,
    unitPrice: row.unitPrice, amount: row.amount, partnerId: row.partnerId,
    txReasonId: row.txReasonId, locationId: row.locationId, userId: row.userId,
    memo: row.memo, refTxNo: row.refTxNo, barcodeId: row.barcodeId,
    currency: row.currency, exchangeRateAtEntry: row.exchangeRateAtEntry,
    createdAt: row.createdAt,
  };
}

/**
 * 참조 전표(refTxNo) 무결성 검증 — 품목/위치 일치 + 잔여수량 이내.
 * POST(신규)와 PUT(수정)에서 공유한다. 위반 시 사용자 메시지를, 통과 시 null을 반환.
 * excludeTxId: 수정 시 자기 자신의 기존 qty를 소비량에서 제외하기 위한 id.
 */
async function validateRefIntegrity(opts: {
  txType: string;
  itemId: number;
  locationId: number;
  qty: number;
  refTxNo: string;
  excludeTxId?: number;
}): Promise<string | null> {
  const { txType, itemId, locationId, qty, refTxNo, excludeTxId } = opts;
  const exclude = excludeTxId ? { NOT: { id: excludeTxId } } : {};

  const refInbound = await prisma.inventoryTx.findUnique({
    where: { txNo: refTxNo },
    select: { qty: true, itemId: true, locationId: true, txType: true },
  });
  // 존재하지 않는 참조 전표를 가리키면(예: ref_tx_no="7" vs 실제 tx_no="07")
  // 아래 무결성 검증들이 조용히 스킵되므로 명시적으로 거부한다.
  if (!refInbound) return `참조 전표(${refTxNo})를 찾을 수 없습니다.`;

  const isInboundRef = refInbound.txType === "입고" || refInbound.txType === "충진 입고";

  if (txType === "폐기" && refInbound.txType === "사용중") {
    // 사용중 건 폐기 — 보유수량은 사용중 시점에 이미 차감되었으므로 여기서 또 깎지 않는다
    if (refInbound.itemId !== itemId) {
      return "참조 사용중 건의 품목과 폐기 품목이 일치하지 않습니다.";
    }
    if (refInbound.locationId !== locationId) {
      return "참조 사용중 건의 위치와 폐기 위치가 일치하지 않습니다.";
    }
    const disposed = await prisma.inventoryTx.aggregate({
      where: { refTxNo, txType: "폐기", ...exclude },
      _sum: { qty: true },
    });
    const remainQty = refInbound.qty - (disposed._sum.qty ?? 0);
    if (qty > remainQty) {
      return `수량 초과: 해당 사용중 건의 폐기 가능 수량은 ${remainQty}개입니다. (요청: ${qty}개)`;
    }
    return null;
  }

  if (isInboundRef) {
    if (refInbound.itemId !== itemId) {
      return "참조 입고 건의 품목과 출고 품목이 일치하지 않습니다.";
    }
    if (refInbound.locationId !== locationId) {
      return "참조 입고 건의 위치와 출고 위치가 일치하지 않습니다.";
    }
    const consumed = await prisma.inventoryTx.aggregate({
      where: { refTxNo, txType: { in: LOT_CONSUME_TYPES }, ...exclude },
      _sum: { qty: true },
    });
    const remainQty = refInbound.qty - (consumed._sum.qty ?? 0);
    if (qty > remainQty) {
      return `수량 초과: 해당 입고건의 잔여수량은 ${remainQty}개입니다. (요청: ${qty}개)`;
    }
    return null;
  }

  if (txType === "폐기") return "폐기는 입고 건 또는 사용중 건만 참조할 수 있습니다.";
  return "참조 전표가 입고 건이 아닙니다.";
}

/** 참조 전표(refTxNo)가 반드시 있어야 하는 유형 */
const REF_REQUIRED_TYPES = ["출고", "불출", "사용중", "폐기"];

/** 재고 원장에 허용되는 위치 — 본사(1)/공덕(2)만.
 *  챔버·Vault 등 세부 물리 위치는 target_log·chamber_slot·ald_port_slot의 영역이다. */
const VALID_LOCATION_IDS = [1, 2];

// GET /api/inventory
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search    = searchParams.get("search")    || "";
    const type      = searchParams.get("type")      || "";
    const category  = searchParams.get("category")  || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate   = searchParams.get("endDate")   || "";
    const exact     = searchParams.get("exact") === "true";

    const andConditions: any[] = [];

    if (type && type !== "전체") {
      andConditions.push({ txType: type });
    }

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      andConditions.push({ txDate: dateFilter });
    }

    if (category && category !== "전체") {
      andConditions.push({ item: { category: { name: category } } });
    }

    const locationId = searchParams.get("locationId");
    if (locationId) {
      andConditions.push({ locationId: Number(locationId) });
    }

    const searchField = searchParams.get("searchField") || "전체";
    // exact=true면 품목명/품목코드/거래처도 정확히 일치로 검색 (바코드는 항상 equals)
    const textMatch = (value: string) =>
      exact
        ? { equals: value, mode: "insensitive" as const }
        : { contains: value, mode: "insensitive" as const };
    if (search) {
      if (searchField === "품목명") {
        andConditions.push({ item: { name: textMatch(search) } });
      } else if (searchField === "품목코드") {
        andConditions.push({ item: { code: textMatch(search) } });
      } else if (searchField === "바코드") {
        andConditions.push({ barcode: { code: { equals: search, mode: "insensitive" } } });
      } else if (searchField === "거래처") {
        andConditions.push({ partner: { name: textMatch(search) } });
      } else {
        andConditions.push({
          OR: [
            { item: { name: textMatch(search) } },
            { item: { code: textMatch(search) } },
            { barcode: { code: exact
              ? { equals: search, mode: "insensitive" as const }
              : { contains: search, mode: "insensitive" as const } } },
            { partner: { name: textMatch(search) } },
          ],
        });
      }
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const page  = parseInt(searchParams.get("page")  ?? "1",  10);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const skip  = (page - 1) * limit;

    const sortFieldParam = searchParams.get("sortField") ?? "date";
    const sortDirParam   = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";

    const orderByMap: Record<string, any> = {
      id:     { id: sortDirParam },
      date:   [{ txDate: sortDirParam }, { id: sortDirParam }],
      qty:    { qty: sortDirParam },
      amount: { amount: sortDirParam },
    };
    const orderBy = orderByMap[sortFieldParam] ?? [{ txDate: "desc" }, { id: "desc" }];

    const [total, transactions] = await Promise.all([
      prisma.inventoryTx.count({ where }),
      prisma.inventoryTx.findMany({
        where,
        include: {
          item:     { include: { category: true, waferSpec: true } },
          partner:  true,
          barcode:  true,
          location: true,
          txReason: true,
          user:     true,
        },
        orderBy,
        take: limit,
        skip,
      }),
    ]);

    const sessionUser = await getSessionUser();
    const isEmployee = !("error" in sessionUser) && sessionUser.role === "employee";

    const result = transactions.map((tx) => ({
      id:         tx.id,
      txNo:       tx.txNo        || "",
      date:       tx.txDate.toISOString().split("T")[0].replace(/-/g, "."),
      type:       tx.txType,
      category:   tx.item.category.name,
      code:       tx.item.code,
      name:       tx.item.name,
      price:      isEmployee ? null : (tx.unitPrice != null ? Number(tx.unitPrice) : null),
      qty:        tx.qty,
      amount:     isEmployee ? null : (tx.amount    != null ? Number(tx.amount)    : null),
      currency:   tx.currency ?? "KRW",
      exchangeRateAtEntry: tx.exchangeRateAtEntry != null ? Number(tx.exchangeRateAtEntry) : null,
      partner:    tx.partner?.name   || "",
      memo:       tx.memo            || "",
      barcode:    tx.barcode?.code   || "",
      barcodeMemo: tx.barcode?.memo  ?? null,
      location:   tx.location?.name  || "",
      locationId: tx.locationId,
      refTxNo:    tx.refTxNo    ?? null,
      itemId:     tx.itemId,
      barcodeId:  tx.barcodeId  ?? null,
      partnerId:  tx.partnerId  ?? null,
      txReasonId: tx.txReasonId ?? null,
      txReason:   tx.txReason?.name  || "",
      userName:   tx.user?.name      ?? null,
      itemSpec:   buildItemSpec(tx.item.waferSpec),
      createdAt:  tx.createdAt?.toISOString() ?? null,
    }));

    return NextResponse.json({ data: result, total, page, limit });
  } catch (error) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json({ error: "데이터 조회 실패" }, { status: 500 });
  }
}

// POST /api/inventory — 새 재고 트랜잭션 생성
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const sessionUserId = await getSessionUserId();

    const body = await request.json();

    if (!body.txType || !VALID_TYPES.includes(body.txType)) {
      return NextResponse.json({ error: "구분은 입고/출고/불출/사용중/폐기 중 하나여야 합니다." }, { status: 400 });
    }
    if (!body.itemId) {
      return NextResponse.json({ error: "품목을 선택해주세요." }, { status: 400 });
    }
    if (!body.qty || Number(body.qty) <= 0) {
      return NextResponse.json({ error: "수량은 1 이상이어야 합니다." }, { status: 400 });
    }
    if (!body.txDate || isNaN(new Date(body.txDate).getTime())) {
      return NextResponse.json({ error: "유효한 날짜를 입력해주세요." }, { status: 400 });
    }
    if (!body.locationId) {
      return NextResponse.json({ error: "위치를 선택해주세요." }, { status: 400 });
    }
    if (!VALID_LOCATION_IDS.includes(Number(body.locationId))) {
      return NextResponse.json({ error: "위치는 본사 또는 공덕만 선택할 수 있습니다." }, { status: 400 });
    }
    if (REF_REQUIRED_TYPES.includes(body.txType) && !body.refTxNo) {
      return NextResponse.json({ error: "출고/불출/사용중/폐기 시 참조 전표번호가 필요합니다." }, { status: 400 });
    }

    // 출고/불출/사용중/폐기 시 바코드 연결 품목 검증
    if (REF_REQUIRED_TYPES.includes(body.txType) && !body.barcodeId) {
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

    // 참조 무결성 + 수량 초과 방지
    // - 출고/불출/사용중: 입고·충진 입고만 참조 (품목/위치 일치, 로트 잔여 이내)
    // - 폐기: (a) 입고 참조 = 미개봉 재고 직접 폐기 → 위와 동일
    //         (b) 사용중 참조 = 다 쓴 것 버림 → 사용중 건의 잔여 이내
    if (REF_REQUIRED_TYPES.includes(body.txType) && body.refTxNo) {
      const refError = await validateRefIntegrity({
        txType:     body.txType,
        itemId:     Number(body.itemId),
        locationId: Number(body.locationId),
        qty:        Number(body.qty),
        refTxNo:    body.refTxNo,
      });
      if (refError) return NextResponse.json({ error: refError }, { status: 400 });
    }

    // ALD Canister 불출 사전 확인 — 폐기·바코드 비활성화·슬롯 비우기가 함께 일어나고
    // 자동 복원이 불가능하므로, 프론트 확인만 믿지 않고 서버에서 반드시 검사한다.
    if (body.txType === "불출" && body.barcodeId && body.confirmAldDispose !== true) {
      const bcCat = await prisma.barcode.findUnique({
        where:  { id: Number(body.barcodeId) },
        select: {
          targetUnitId: true,
          item: { select: { category: { select: { name: true } } } },
        },
      });
      if (bcCat?.item?.category?.name === "ALD Canister" && bcCat.targetUnitId) {
        return NextResponse.json(
          {
            error:        "확인이 필요합니다.",
            needsConfirm: "aldDispose",
            message:      "ALD Canister를 불출하면 다음이 함께 처리됩니다.",
            effects: [
              "캐니스터 상태가 '폐기'로 변경됩니다",
              "바코드가 비활성화됩니다",
              "장착된 포트 슬롯이 비워집니다",
            ],
            warning: "이 작업은 자동으로 되돌릴 수 없습니다.",
          },
          { status: 409 }
        );
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

    // 출고/불출/사용중/폐기 시 참조 건 가격 자동 복사
    // (사용중이 입고에서 복사하므로 폐기→사용중 체인으로 가격이 이어진다)
    let resolvedUnitPrice = body.unitPrice || null;
    let resolvedAmount = body.amount || null;
    let resolvedCurrency = body.currency ?? "KRW";
    let resolvedExchangeRate = body.currency === "USD" ? (body.exchangeRateAtEntry ?? null) : null;

    if (REF_REQUIRED_TYPES.includes(body.txType) && body.refTxNo) {
      const refTx = await prisma.inventoryTx.findUnique({
        where:  { txNo: body.refTxNo },
        select: { unitPrice: true, amount: true, currency: true, exchangeRateAtEntry: true, qty: true, locationId: true },
      });
      // 위 무결성 검증 블록에서 이미 존재를 확인했지만, 방어적으로 한 번 더 거부한다.
      if (!refTx) {
        return NextResponse.json(
          { error: `참조 전표(${body.refTxNo})를 찾을 수 없습니다.` },
          { status: 400 }
        );
      }
      if (refTx.locationId !== Number(body.locationId)) {
        return NextResponse.json(
          { error: `참조 건의 위치(${refTx.locationId === 1 ? "본사" : "공덕"})와 요청 위치가 다릅니다. 참조 건과 같은 위치에서만 처리할 수 있습니다.` },
          { status: 400 }
        );
      }
      resolvedCurrency = refTx.currency ?? "KRW";
      resolvedExchangeRate = refTx.exchangeRateAtEntry != null ? Number(refTx.exchangeRateAtEntry) : null;
      if (refTx.unitPrice != null) {
        resolvedUnitPrice = Number(refTx.unitPrice);
        resolvedAmount = Number(refTx.unitPrice) * Number(body.qty);
      }
    }

    // 불출처 처리: disburseeUserId로 user 조회 후 partner 매칭
    // 사용중/폐기는 사내 처리이므로 거래처가 없다.
    const noPartnerType =
      body.txType === "불출" || body.txType === "사용중" || body.txType === "폐기";
    let finalPartnerId = noPartnerType ? null : (body.partnerId || null);
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

    // 거래 생성과 그로 인한 자동 상태 전이는 반드시 한 트랜잭션 안에서 끝낸다.
    // (중간 실패 시 "거래는 있는데 상태는 안 바뀐"/"상태만 바뀐" 불일치가 생기므로)
    type PendingTransition = {
      targetUnitId: number; from: string; to: string; extra: Record<string, unknown>;
    };

    const { tx, pending } = await prisma.$transaction(async (db) => {
      const pending: PendingTransition[] = [];
      const created = await db.inventoryTx.create({
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
        userId:       sessionUserId ?? null,
        memo:         body.memo         || null,
        targetUnitId: body.targetUnitId || null,
        barcodeId:    body.barcodeId    || null,
        refTxNo:      body.refTxNo      || null,
        currency:            resolvedCurrency,
        exchangeRateAtEntry: resolvedExchangeRate,
      },
    });

    // 충진 입고 시: ald_canister_spec 물질명 업데이트 + 상태 → 사용중
    if (body.txType === "충진 입고" && body.barcodeId) {
      const fillBc = await db.barcode.findUnique({
        where:  { id: Number(body.barcodeId) },
        select: { targetUnitId: true },
      });
      if (fillBc?.targetUnitId) {
        await db.aldCanisterSpec.updateMany({
          where: { targetUnitId: fillBc.targetUnitId },
          data:  {
            materialName:       body.aldMaterialName || null,
            initialGrossWeight: body.aldInitialGross
              ? Number(body.aldInitialGross) : undefined,
            updatedAt: new Date(),
          },
        });
        // 전이 직전 상태를 from으로 확보한 뒤 전이
        const fillBefore = await db.targetUnit.findUnique({
          where:  { id: fillBc.targetUnitId },
          select: { status: true },
        });
        await db.targetUnit.update({
          where: { id: fillBc.targetUnitId },
          data:  { status: "사용중" },
        });
        if (fillBefore && fillBefore.status !== "사용중") {
          pending.push({
            targetUnitId: fillBc.targetUnitId,
            from: fillBefore.status, to: "사용중", extra: {},
          });
        }

        // 충진 입고 → target_log + ald_log_detail 생성 (ALD 탭 이력에 표시)
        const fillLog = await db.targetLog.create({
          data: {
            targetUnitId: fillBc.targetUnitId,
            logType:      "측정",
            loggedAt:     new Date(),
            userId:       sessionUserId ?? null,
          },
        });

        const fillSpec = await db.aldCanisterSpec.findUnique({
          where: { targetUnitId: fillBc.targetUnitId },
        });

        await db.aldLogDetail.create({
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
      const bc = await db.barcode.findUnique({
        where: { id: Number(body.barcodeId) },
        select: { targetUnitId: true },
      });
      if (bc?.targetUnitId) {
        const tu = await db.targetUnit.findUnique({
          where: { id: bc.targetUnitId },
          select: { status: true },
        });
        if (tu?.status === "미사용") {
          await db.targetUnit.update({
            where: { id: bc.targetUnitId },
            data: { status: "판매완료" },
          });
          pending.push({
            targetUnitId: bc.targetUnitId,
            from: "미사용", to: "판매완료", extra: {},
          });
        }
      }
    }

    // 불출 시: ALD Canister이면 폐기 자동 처리 + 포트 슬롯 비우기
    if (body.txType === "불출" && body.barcodeId) {
      const bc = await db.barcode.findUnique({
        where: { id: Number(body.barcodeId) },
        include: {
          item: { include: { category: true } },
          targetUnit: true,
        },
      });
      if (bc?.item?.category?.name === "ALD Canister" && bc.targetUnitId) {
        const fromStatus = bc.targetUnit?.status ?? "";
        // 상태 → 폐기
        await db.targetUnit.update({
          where: { id: bc.targetUnitId },
          data: { status: "폐기", disposedAt: new Date() },
        });
        // 바코드 비활성화
        await db.barcode.update({
          where: { id: Number(body.barcodeId) },
          data: { isActive: "N" },
        });
        // 포트 슬롯 자동 비우기
        await db.aldPortSlot.updateMany({
          where: { targetUnitId: bc.targetUnitId },
          data: { targetUnitId: null, loadedAt: null },
        });
        pending.push({
          targetUnitId: bc.targetUnitId,
          from: fromStatus, to: "폐기",
          extra: {
            barcodeDeactivated: true,
            barcodeId: Number(body.barcodeId),
            portSlotCleared: true,
          },
        });
      }
    }

      return { tx: created, pending };
    });

    // 전이 기록은 커밋이 확정된 뒤에 남긴다 (롤백된 전이를 기록하지 않기 위함)
    for (const p of pending) {
      await recordAutoTransition({
        userId:       sessionUserId,
        targetUnitId: p.targetUnitId,
        from:         p.from,
        to:           p.to,
        byTxNo:       newTxNo,
        byTxType:     body.txType,
        extra:        p.extra,
      });
    }

    // 폐기 시: 연결된 타겟유닛 폐기 처리 + 바코드 비활성화 + 슬롯 비우기
    if (body.txType === "폐기" && body.barcodeId) {
      const bc = await prisma.barcode.findUnique({
        where: { id: Number(body.barcodeId) },
        include: { targetUnit: true },
      });
      if (bc?.targetUnitId && bc.targetUnit) {
        const tuId = bc.targetUnitId;
        // 이미 폐기 상태면 상태/일시는 건드리지 않는다 (최초 폐기 시각 보존)
        if (bc.targetUnit.status !== "폐기") {
          await prisma.targetUnit.update({
            where: { id: tuId },
            data: { status: "폐기", disposedAt: new Date() },
          });
        }
        await prisma.barcode.update({
          where: { id: Number(body.barcodeId) },
          data: { isActive: "N" },
        });

        if (bc.targetUnit.category === "ald") {
          await prisma.aldPortSlot.updateMany({
            where: { targetUnitId: tuId },
            data: { targetUnitId: null, loadedAt: null },
          });
        } else {
          // 스퍼터 타겟: 챔버에 장착돼 있었다면 비우고 unload 이력 기록
          const disposedSlots = await prisma.chamberSlot.findMany({
            where: { targetUnitId: tuId },
            select: { locationId: true },
          });
          if (disposedSlots.length > 0) {
            await prisma.chamberSlot.updateMany({
              where: { targetUnitId: tuId },
              data: { targetUnitId: null, loadedAt: null },
            });
            for (const s of disposedSlots) {
              await prisma.chamberSlotLog.create({
                data: {
                  locationId: s.locationId,
                  targetUnitId: null,
                  previousTargetUnitId: tuId,
                  action: "unload",
                  changedById: sessionUserId ?? null,
                  note: "폐기 처리로 자동 비움",
                },
              });
            }
          }
        }
      }
    }

    // activity_log 기록 (등록 시점 내용을 detail에 스냅샷)
    await logActivity(sessionUserId, "CREATE", "inventory_tx", tx.id, await buildInventoryTxDetail(tx.id));

    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    console.error("POST /api/inventory error:", error);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}

// PUT /api/inventory?id=123 — 트랜잭션 수정
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: "유효한 id 파라미터가 필요합니다." }, { status: 400 });
    }

    const body = await request.json();

    if (body.txType !== undefined && !VALID_TYPES.includes(body.txType)) {
      return NextResponse.json({ error: "구분은 입고/출고/불출/사용중/폐기 중 하나여야 합니다." }, { status: 400 });
    }
    if (body.qty !== undefined && Number(body.qty) <= 0) {
      return NextResponse.json({ error: "수량은 1 이상이어야 합니다." }, { status: 400 });
    }
    if (body.txDate !== undefined && isNaN(new Date(body.txDate).getTime())) {
      return NextResponse.json({ error: "유효한 날짜를 입력해주세요." }, { status: 400 });
    }
    if (body.locationId !== undefined && !VALID_LOCATION_IDS.includes(Number(body.locationId))) {
      return NextResponse.json({ error: "위치는 본사 또는 공덕만 선택할 수 있습니다." }, { status: 400 });
    }

    const sessionUserId = await getSessionUserId();

    const before = await prisma.inventoryTx.findUnique({
      where: { id: Number(id) },
      include: { item: true, partner: true, location: true, barcode: true },
    });

    if (!before) {
      return NextResponse.json(
        { error: "수정할 거래를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // ① 자기 자신을 참조 입고건으로 선택하는 것 차단
    if (body.refTxNo && body.refTxNo === before.txNo) {
      return NextResponse.json(
        { error: "자기 자신의 입고건을 참조할 수 없습니다." },
        { status: 400 }
      );
    }

    // ② 입고건을 출고/불출로 구분 변경 차단
    if (
      before.txType === "입고" &&
      body.txType &&
      (body.txType === "출고" || body.txType === "불출")
    ) {
      return NextResponse.json(
        { error: "입고 건은 출고/불출로 변경할 수 없습니다. 삭제 후 새로 등록해 주세요." },
        { status: 400 }
      );
    }

    // ③ 출고/불출건을 입고로 구분 변경 차단
    if (
      (before.txType === "출고" || before.txType === "불출") &&
      body.txType === "입고"
    ) {
      return NextResponse.json(
        { error: "출고/불출 건은 입고로 변경할 수 없습니다. 삭제 후 새로 등록해 주세요." },
        { status: 400 }
      );
    }

    // ④ 사용중/폐기는 참조 체인의 기준점이므로 구분 변경 자체를 차단
    const USING_DISPOSE = ["사용중", "폐기"];
    if (
      body.txType && body.txType !== before.txType &&
      (USING_DISPOSE.includes(before.txType) || USING_DISPOSE.includes(body.txType))
    ) {
      return NextResponse.json(
        { error: "사용중/폐기 건은 구분을 변경할 수 없습니다. 삭제 후 새로 등록해 주세요." },
        { status: 400 }
      );
    }

    // ── 정합성 가드 ⑤~⑨ ─────────────────────────────────
    // 수정 후 실제로 적용될 값들 (body에 없으면 기존 값 유지)
    const nextTxType     = body.txType     ?? before.txType;
    const nextItemId     = body.itemId     !== undefined ? Number(body.itemId)     : before.itemId;
    const nextLocationId = body.locationId !== undefined ? Number(body.locationId) : before.locationId;
    const nextQty        = body.qty        !== undefined ? Number(body.qty)        : before.qty;
    const nextRefTxNo    = body.refTxNo    !== undefined ? (body.refTxNo ?? null)  : before.refTxNo;
    const isInboundType  = nextTxType === "입고" || nextTxType === "충진 입고";

    // ⑤ 이미 소비된 수량 아래로 입고 수량을 줄이면 원장이 음수가 된다
    if (isInboundType && body.qty !== undefined && before.txNo) {
      const consumedAgg = await prisma.inventoryTx.aggregate({
        where: { refTxNo: before.txNo, txType: { in: LOT_CONSUME_TYPES } },
        _sum:  { qty: true },
      });
      const consumed = consumedAgg._sum.qty ?? 0;
      if (nextQty < consumed) {
        return NextResponse.json(
          { error: `이 입고건은 이미 ${consumed}개가 사용되었습니다. 수량을 ${consumed}개 미만으로 줄일 수 없습니다. 먼저 연결된 출고/불출/사용중/폐기 건을 삭제해 주세요.` },
          { status: 400 }
        );
      }
    }

    // ⑥ 자식(참조 건)이 있는 입고건의 위치를 바꾸면 참조 건과 위치가 어긋난다.
    //    자식이 0건이면 자유롭게 변경 가능 — 기존 보정 작업을 막지 않는다.
    if (
      isInboundType && body.locationId !== undefined &&
      Number(body.locationId) !== before.locationId && before.txNo
    ) {
      const childCount = await prisma.inventoryTx.count({
        where: { refTxNo: before.txNo, NOT: { id: Number(id) } },
      });
      if (childCount > 0) {
        return NextResponse.json(
          { error: `이 입고건을 참조하는 거래가 ${childCount}건 있습니다. 위치를 변경하면 참조 건과 불일치가 발생합니다. 먼저 참조 거래를 정리해 주세요.` },
          { status: 400 }
        );
      }
    }

    // ⑦ 출고/불출/사용중/폐기의 위치는 참조 건과 반드시 같아야 한다
    if (
      REF_REQUIRED_TYPES.includes(nextTxType) && nextRefTxNo &&
      body.locationId !== undefined
    ) {
      const refLoc = await prisma.inventoryTx.findUnique({
        where:  { txNo: nextRefTxNo },
        select: { locationId: true, location: { select: { name: true } } },
      });
      if (refLoc && refLoc.locationId !== Number(body.locationId)) {
        return NextResponse.json(
          { error: `참조 건의 위치(${refLoc.location?.name ?? refLoc.locationId})와 달라집니다. 같은 위치에서만 처리할 수 있습니다.` },
          { status: 400 }
        );
      }
    }

    // ⑧⑨ 수량 증가 / 참조 전표 변경 / 품목·위치 변경 시 POST와 동일한 무결성 검증.
    //     자기 자신의 기존 qty 는 소비량에서 제외한다(excludeTxId).
    const refAffecting =
      body.qty        !== undefined ||
      body.refTxNo    !== undefined ||
      body.itemId     !== undefined ||
      body.locationId !== undefined ||
      body.txType     !== undefined;
    if (REF_REQUIRED_TYPES.includes(nextTxType) && nextRefTxNo && refAffecting && nextLocationId != null) {
      const refError = await validateRefIntegrity({
        txType:      nextTxType,
        itemId:      nextItemId,
        locationId:  nextLocationId,
        qty:         nextQty,
        refTxNo:     nextRefTxNo,
        excludeTxId: Number(id),
      });
      if (refError) return NextResponse.json({ error: refError }, { status: 400 });
    }

    const tx = await prisma.inventoryTx.update({
      where: { id: Number(id) },
      data: {
        txDate:     body.txDate ? new Date(body.txDate) : undefined,
        txType:     body.txType     ?? undefined,
        itemId:     body.itemId     ?? undefined,
        qty:        body.qty        ?? undefined,
        unitPrice:  body.unitPrice  ?? undefined,
        amount:     body.amount     ?? undefined,
        partnerId:  body.partnerId  ?? undefined,
        memo:       body.memo       ?? undefined,
        locationId: body.locationId ?? undefined,
        barcodeId:  body.barcodeId  ?? undefined,
        refTxNo:    body.refTxNo !== undefined ? (body.refTxNo ?? null) : undefined,
        txReasonId: body.txReasonId ?? undefined,
        currency:   body.currency   ?? undefined,
        exchangeRateAtEntry: body.exchangeRateAtEntry ?? undefined,
      },
    });

    // activity_log 기록
    const _changes: string[] = [];
    if (before) {
      if (body.txDate !== undefined) {
        const bd = before.txDate.toISOString().split("T")[0];
        const ad = body.txDate;
        if (bd !== ad) _changes.push(`날짜: ${bd} → ${ad}`);
      }
      if (body.qty !== undefined && String(before.qty) !== String(body.qty))
        _changes.push(`수량: ${before.qty} → ${body.qty}`);
      if (body.txType !== undefined && before.txType !== body.txType)
        _changes.push(`구분: ${before.txType} → ${body.txType}`);
      if (body.locationId !== undefined && String(before.locationId ?? "") !== String(body.locationId)) {
        const afterLoc = await prisma.location.findUnique({ where: { id: Number(body.locationId) } });
        _changes.push(`위치: ${before.location?.name ?? "-"} → ${afterLoc?.name ?? String(body.locationId)}`);
      }
      if (body.memo !== undefined && (before.memo ?? "") !== (body.memo ?? ""))
        _changes.push(`비고: ${before.memo || "-"} → ${body.memo || "-"}`);
      if (body.unitPrice !== undefined && String(before.unitPrice ?? "") !== String(body.unitPrice ?? ""))
        _changes.push(`단가: ${before.unitPrice ?? "-"} → ${body.unitPrice ?? "-"}`);
      if (body.currency !== undefined && (before.currency ?? "") !== (body.currency ?? ""))
        _changes.push(`통화: ${before.currency ?? "-"} → ${body.currency ?? "-"}`);
      if (body.refTxNo !== undefined && (before.refTxNo ?? "") !== (body.refTxNo ?? ""))
        _changes.push(`참조입고: ${before.refTxNo ?? "-"} → ${body.refTxNo ?? "-"}`);
      if (body.partnerId !== undefined && String(before.partnerId ?? "") !== String(body.partnerId)) {
        const afterPartner = await prisma.partner.findUnique({ where: { id: Number(body.partnerId) } });
        _changes.push(`거래처: ${before.partner?.name ?? "-"} → ${afterPartner?.name ?? String(body.partnerId)}`);
      }
      if (body.barcodeId !== undefined && String(before.barcodeId ?? "") !== String(body.barcodeId)) {
        const afterBarcode = await prisma.barcode.findUnique({ where: { id: Number(body.barcodeId) } });
        _changes.push(`바코드: ${before.barcode?.code ?? "-"} → ${afterBarcode?.code ?? String(body.barcodeId)}`);
      }
    }
    const _detail = _changes.length > 0
      ? `${inventoryTxHeader(before)} ${_changes.join(" | ")}`
      : undefined;
    if (_detail) {
      // ⑩ 변경 전 행 전체를 snapshot으로 굳혀 둔다
      await logActivity(
        sessionUserId, "UPDATE", "inventory_tx", Number(id), _detail,
        txRowSnapshot(before)
      );
    }

    return NextResponse.json(tx);
  } catch (error) {
    console.error("PUT /api/inventory error:", error);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

// DELETE /api/inventory?id=123 — 트랜잭션 삭제
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: "유효한 id 파라미터가 필요합니다." }, { status: 400 });
    }

    const sessionUserId = await getSessionUserId();

    // 삭제 전 거래 정보 조회 (삭제되면 복원 불가 → 로그 스냅샷용 관계까지 함께 로드)
    const beforeDelete = await prisma.inventoryTx.findUnique({
      where: { id: Number(id) },
      include: {
        barcode:  { select: { id: true, code: true, targetUnitId: true } },
        item:     true,
        partner:  true,
        location: true,
        user:     true,
      },
    });

    if (!beforeDelete) {
      return NextResponse.json(
        { error: "삭제할 거래를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // ① 입고/충진 입고/사용중 건이면: 이를 참조하는 거래가 있는지 확인
    //    (사용중을 참조한 폐기가 남아 있으면 사용중 삭제를 막는다)
    if (
      beforeDelete.txType === "입고" ||
      beforeDelete.txType === "충진 입고" ||
      beforeDelete.txType === "사용중"
    ) {
      const refCount = await prisma.inventoryTx.count({
        where: {
          refTxNo: beforeDelete.txNo,
          NOT: { id: Number(id) },
        },
      });
      if (refCount > 0) {
        return NextResponse.json(
          {
            error: `이 거래를 참조하는 거래가 ${refCount}건 있습니다. 먼저 해당 거래를 삭제해 주세요.`,
          },
          { status: 400 }
        );
      }

      // ② 입고건과 연결된 target_unit에 측정/사용 이력이 있는지 확인
      //    (사용중 건은 측정 이력에서 파생된 것이므로 이 검사 대상이 아니다)
      if (beforeDelete.txType !== "사용중" && beforeDelete.barcode?.targetUnitId) {
        const logCount = await prisma.targetLog.count({
          where: { targetUnitId: beforeDelete.barcode.targetUnitId },
        });
        if (logCount > 0) {
          return NextResponse.json(
            {
              error: `이 거래에 연결된 측정/사용 이력이 ${logCount}건 있습니다. 측정 이력을 먼저 삭제할 수 없으므로, 이 거래는 삭제할 수 없습니다.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // 삭제 전에 스냅샷 문자열을 굳혀 둔다 (구성 실패해도 로그 기록은 진행)
    let deleteDetail: string | undefined;
    try {
      deleteDetail = formatInventoryTxDetail(beforeDelete);
    } catch { deleteDetail = undefined; }

    const rowSnapshot = txRowSnapshot(beforeDelete);

    // ③ 이 거래가 타겟/캐니스터 상태를 자동 전이시켰다면, 안전하게 되돌릴 수 있을 때만 삭제한다.
    //    틀린 복원을 하느니 차단한다 — 판정이 애매하면 409.
    const TRANSITION_TYPES = ["출고", "불출", "충진 입고"];
    const transitionTuId =
      beforeDelete.targetUnitId ?? beforeDelete.barcode?.targetUnitId ?? null;

    if (TRANSITION_TYPES.includes(beforeDelete.txType) && transitionTuId) {
      const resolved = beforeDelete.txNo
        ? await resolveAutoTransitionRevert({ targetUnitId: transitionTuId, txNo: beforeDelete.txNo })
        : ({ ok: false, reason: "전표번호가 없어 전이 기록을 찾을 수 없습니다" } as const);

      if (!resolved.ok) {
        const cur = await prisma.targetUnit.findUnique({
          where:  { id: transitionTuId },
          select: { status: true },
        });
        return NextResponse.json(
          {
            error:   "이 거래는 타겟/캐니스터 상태를 변경했으나 안전하게 되돌릴 수 없습니다.",
            blocked: true,
            reason:  resolved.reason,
            currentStatus: cur?.status ?? null,
            suggestion: "타겟 상태를 직접 확인하고 필요하면 수동으로 변경한 뒤 다시 시도해 주세요.",
          },
          { status: 409 }
        );
      }

      const revertTo = resolved.revertTo;
      const revertBarcodeId =
        resolved.extra.barcodeDeactivated === true
          ? (typeof resolved.extra.barcodeId === "number" ? resolved.extra.barcodeId : beforeDelete.barcodeId)
          : null;

      await prisma.$transaction(async (db) => {
        await db.inventoryTx.delete({ where: { id: Number(id) } });
        await db.targetUnit.update({
          where: { id: transitionTuId },
          data: {
            status: revertTo,
            // 폐기로 되돌아가는 경우가 아니면 폐기 일시를 지운다
            disposedAt: revertTo === "폐기" ? undefined : null,
          },
        });
        if (revertBarcodeId) {
          await db.barcode.update({
            where: { id: revertBarcodeId },
            data:  { isActive: "Y" },
          });
        }
      });

      await logActivity(
        sessionUserId, "DELETE", "inventory_tx", Number(id),
        [deleteDetail, `상태 복원: ${resolved.extra.to ?? "-"} → ${revertTo}`]
          .filter(Boolean).join(" | "),
        { ...rowSnapshot, _reverted: true, _revertedTo: revertTo }
      );

      // 포트 슬롯은 물리적 장착 상태이므로 소프트웨어가 임의로 되돌리지 않는다
      return NextResponse.json({
        message:
          resolved.extra.portSlotCleared === true
            ? "삭제 완료 (상태 복원됨). 포트 슬롯은 자동 복원되지 않습니다. ALD 탭에서 직접 확인해 주세요."
            : "삭제 완료 (상태 복원됨)",
        revertedTo: revertTo,
      });
    }

    await prisma.inventoryTx.delete({ where: { id: Number(id) } });

    // activity_log 기록 (삭제 원문 전체를 snapshot으로 보존)
    await logActivity(
      sessionUserId, "DELETE", "inventory_tx", Number(id), deleteDetail, rowSnapshot
    );

    return NextResponse.json({ message: "삭제 완료" });
  } catch (error) {
    console.error("DELETE /api/inventory error:", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
