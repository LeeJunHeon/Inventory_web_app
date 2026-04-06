import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireAuth, getSessionUser } from "@/lib/auth-helpers";

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

    if (startDate && endDate) {
      andConditions.push({ txDate: { gte: new Date(startDate), lte: new Date(endDate) } });
    }

    if (category && category !== "전체") {
      andConditions.push({ item: { category: { name: category } } });
    }

    if (search) {
      andConditions.push({
        OR: [
          { item: { name: { contains: search, mode: "insensitive" } } },
          { item: { code: { contains: search, mode: "insensitive" } } },
          { barcode: { code: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const sessionUser = await getSessionUser();
    const isEmployee = !("error" in sessionUser) && sessionUser.role === "employee";

    const transactions = await prisma.inventoryTx.findMany({
      where,
      include: {
        item:     { include: { category: true, waferSpec: true } },
        partner:  true,
        barcode:  true,
        location: true,
        txReason: true,
        user:     true,
      },
      orderBy: { id: "desc" },
    });

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
      txReason:   tx.txReason?.name  || "",
      userName:   tx.user?.name      ?? null,
      itemSpec:   buildItemSpec(tx.item.waferSpec),
    }));

    return NextResponse.json(result);
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
    // 세션에서 로그인 사용자 id 조회
    const session = await auth();
    let sessionUserId: number | null = null;
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where:  { email: session.user.email },
        select: { id: true },
      });
      sessionUserId = user?.id ?? null;
    }

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

    // 전표번호 자동 채번: 기존 tx_no 중 가장 큰 숫자 + 1
    const lastTx = await prisma.inventoryTx.findFirst({
      where:   { txNo: { not: null } },
      orderBy: { id: "desc" },
      select:  { txNo: true },
    });
    const lastNo  = lastTx?.txNo ? (parseInt(lastTx.txNo, 10) || 0) : 0;
    const newTxNo = String(lastNo + 1);

    // 출고/불출 시 참조 입고 건 가격 자동 복사
    let resolvedUnitPrice = body.unitPrice || null;
    let resolvedAmount = body.amount || null;
    let resolvedCurrency = body.currency ?? "KRW";
    let resolvedExchangeRate = body.currency === "USD" ? (body.exchangeRateAtEntry ?? null) : null;

    if ((body.txType === "출고" || body.txType === "불출") && body.refTxNo) {
      const refTx = await prisma.inventoryTx.findUnique({
        where:  { txNo: body.refTxNo },
        select: { unitPrice: true, amount: true, currency: true, exchangeRateAtEntry: true, qty: true },
      });
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
        txReasonId: body.txReasonId ?? undefined,
        currency:   body.currency   ?? undefined,
        exchangeRateAtEntry: body.exchangeRateAtEntry ?? undefined,
      },
    });

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

    await prisma.inventoryTx.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "삭제 완료" });
  } catch (error) {
    console.error("DELETE /api/inventory error:", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
