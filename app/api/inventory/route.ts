import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

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

    const transactions = await prisma.inventoryTx.findMany({
      where,
      include: {
        item:     { include: { category: true } },
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
      price:      Number(tx.unitPrice || 0),
      qty:        tx.qty,
      amount:     Number(tx.amount || 0),
      partner:    tx.partner?.name   || "",
      memo:       tx.memo            || "",
      barcode:    tx.barcode?.code   || "",
      location:   tx.location?.name  || "",
      locationId: tx.locationId,
      txReason:   tx.txReason?.name  || "",
      userName:   tx.user?.name      ?? null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json({ error: "데이터 조회 실패" }, { status: 500 });
  }
}

// POST /api/inventory — 새 재고 트랜잭션 생성
export async function POST(request: NextRequest) {
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

    // 전표번호 자동 채번: 기존 tx_no 중 가장 큰 숫자 + 1
    const lastTx = await prisma.inventoryTx.findFirst({
      where:   { txNo: { not: null } },
      orderBy: { id: "desc" },
      select:  { txNo: true },
    });
    const lastNo  = lastTx?.txNo ? (parseInt(lastTx.txNo, 10) || 0) : 0;
    const newTxNo = String(lastNo + 1);

    const tx = await prisma.inventoryTx.create({
      data: {
        txNo:         newTxNo,
        txDate:       new Date(body.txDate),
        txType:       body.txType,
        itemId:       Number(body.itemId),
        qty:          Number(body.qty),
        unitPrice:    body.unitPrice    || null,
        amount:       body.amount       || null,
        partnerId:    body.partnerId    || null,
        txReasonId:   body.txReasonId   || null,
        locationId:   Number(body.locationId),
        userId:       sessionUserId      ?? body.userId ?? null,
        memo:         body.memo         || null,
        targetUnitId: body.targetUnitId || null,
        barcodeId:    body.barcodeId    || null,
        refTxNo:      body.refTxNo      || null,
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
