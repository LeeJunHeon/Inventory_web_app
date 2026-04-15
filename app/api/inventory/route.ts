import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser, getSessionUserId, logActivity } from "@/lib/auth-helpers";

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

const VALID_TYPES = ["입고", "출고", "불출"];

// GET /api/inventory
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search    = searchParams.get("search")    || "";
    const type      = searchParams.get("type")      || "";
    const category  = searchParams.get("category")  || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate   = searchParams.get("endDate")   || "";

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
    if (search) {
      if (searchField === "품목명") {
        andConditions.push({ item: { name: { contains: search, mode: "insensitive" } } });
      } else if (searchField === "품목코드") {
        andConditions.push({ item: { code: { contains: search, mode: "insensitive" } } });
      } else if (searchField === "바코드") {
        andConditions.push({ barcode: { code: { equals: search, mode: "insensitive" } } });
      } else if (searchField === "거래처") {
        andConditions.push({ partner: { name: { contains: search, mode: "insensitive" } } });
      } else {
        andConditions.push({
          OR: [
            { item: { name: { contains: search, mode: "insensitive" } } },
            { item: { code: { contains: search, mode: "insensitive" } } },
            { barcode: { code: { contains: search, mode: "insensitive" } } },
            { partner: { name: { contains: search, mode: "insensitive" } } },
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
      location:   tx.location?.name  || "",
      locationId: tx.locationId,
      refTxNo:    tx.refTxNo    ?? null,
      itemId:     tx.itemId,
      barcodeId:  tx.barcodeId  ?? null,
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
      return NextResponse.json({ error: "구분은 입고/출고/불출 중 하나여야 합니다." }, { status: 400 });
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
    if ((body.txType === "출고" || body.txType === "불출") && !body.refTxNo) {
      return NextResponse.json({ error: "출고/불출 시 참조 입고 전표번호가 필요합니다." }, { status: 400 });
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

    // 타겟 바코드 중복 입고 방지
    if (body.txType === "입고" && body.barcodeId) {
      const barcode = await prisma.barcode.findUnique({
        where: { id: Number(body.barcodeId) },
        include: { item: { include: { category: true } } },
      });
      if (barcode?.item?.category?.name === "타겟") {
        const existingInbound = await prisma.inventoryTx.findFirst({
          where: { barcodeId: Number(body.barcodeId), txType: "입고" },
        });
        if (existingInbound) {
          return NextResponse.json(
            { error: `해당 타겟 바코드(${barcode.code})는 이미 입고된 이력이 있습니다. 타겟은 바코드당 1회만 입고 가능합니다.` },
            { status: 400 }
          );
        }
      }
    }

    // 출고/불출 수량 초과 방지
    if ((body.txType === "출고" || body.txType === "불출") && body.refTxNo) {
      const refInbound = await prisma.inventoryTx.findUnique({
        where: { txNo: body.refTxNo },
        select: { qty: true },
      });
      if (refInbound) {
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
        userId:       sessionUserId      ?? body.userId ?? null,
        memo:         body.memo         || null,
        targetUnitId: body.targetUnitId || null,
        barcodeId:    body.barcodeId    || null,
        refTxNo:      body.refTxNo      || null,
        currency:            resolvedCurrency,
        exchangeRateAtEntry: resolvedExchangeRate,
      },
    });

    // activity_log 기록
    await logActivity(sessionUserId, "CREATE", "inventory_tx", tx.id);

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
      return NextResponse.json({ error: "구분은 입고/출고/불출 중 하나여야 합니다." }, { status: 400 });
    }
    if (body.qty !== undefined && Number(body.qty) <= 0) {
      return NextResponse.json({ error: "수량은 1 이상이어야 합니다." }, { status: 400 });
    }
    if (body.txDate !== undefined && isNaN(new Date(body.txDate).getTime())) {
      return NextResponse.json({ error: "유효한 날짜를 입력해주세요." }, { status: 400 });
    }

    const sessionUserId = await getSessionUserId();

    const before = await prisma.inventoryTx.findUnique({
      where: { id: Number(id) },
      include: { item: true, partner: true, location: true, barcode: true },
    });

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
    const _detail = _changes.length > 0 ? _changes.join(" | ") : undefined;
    if (_detail) {
      await logActivity(sessionUserId, "UPDATE", "inventory_tx", Number(id), _detail);
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

    await prisma.inventoryTx.delete({ where: { id: Number(id) } });

    // activity_log 기록
    await logActivity(sessionUserId, "DELETE", "inventory_tx", Number(id));

    return NextResponse.json({ message: "삭제 완료" });
  } catch (error) {
    console.error("DELETE /api/inventory error:", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
