import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    // ✅ 버그 수정: AND 배열로 조건을 명확하게 분리
    // category + search 동시 사용 시 where.item 충돌 방지
    const andConditions: any[] = [];

    if (type && type !== "전체") {
      andConditions.push({ type });
    }

    if (startDate && endDate) {
      andConditions.push({ date: { gte: new Date(startDate), lte: new Date(endDate) } });
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
        item:    { include: { category: true } },
        partner: true,
        barcode: true,
        creator: true,
      },
      orderBy: { id: "desc" },
    });

    const result = transactions.map((tx) => ({
      id:       tx.id,
      date:     tx.date.toISOString().split("T")[0].replace(/-/g, "."),
      type:     tx.type,
      category: tx.item.category.name,
      code:     tx.item.code,
      name:     tx.item.name,
      price:    Number(tx.unitPrice),
      qty:      tx.quantity,
      amount:   Number(tx.amount),
      currency: tx.currency,
      partner:  tx.partner?.name    || "",
      handler:  tx.handlerName      || "",
      memo:     tx.memo             || "",
      barcode:  tx.barcode?.code    || "",
      location: tx.location         || "",
      // 웨이퍼 속성
      waferResistance: tx.waferResistance || "",
      waferThickness:  tx.waferThickness  || "",
      waferDirection:  tx.waferDirection  || "",
      waferSurface:    tx.waferSurface    || "",
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
    const body = await request.json();

    // 입력 검증
    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "구분은 입고/출고/불출 중 하나여야 합니다." }, { status: 400 });
    }
    if (!body.itemId) {
      return NextResponse.json({ error: "품목을 선택해주세요." }, { status: 400 });
    }
    if (!body.quantity || Number(body.quantity) <= 0) {
      return NextResponse.json({ error: "수량은 1 이상이어야 합니다." }, { status: 400 });
    }
    if (!body.date || isNaN(new Date(body.date).getTime())) {
      return NextResponse.json({ error: "유효한 날짜를 입력해주세요." }, { status: 400 });
    }

    const tx = await prisma.inventoryTx.create({
      data: {
        date:           new Date(body.date),
        type:           body.type,
        itemId:         Number(body.itemId),
        quantity:       Number(body.quantity),
        unitPrice:      body.unitPrice      || 0,
        currency:       body.currency       || "KRW",
        amount:         body.amount         || 0,
        partnerId:      body.partnerId      || null,
        handlerName:    body.handlerName    || null,
        handlerContact: body.handlerContact || null,
        memo:           body.memo           || null,
        targetUnitId:   body.targetUnitId   || null,
        refInboundId:   body.refInboundId   || null,
        barcodeId:      body.barcodeId      || null,
        location:       body.location       || null,
        waferResistance: body.waferResistance || null,
        waferThickness:  body.waferThickness  || null,
        waferDirection:  body.waferDirection  || null,
        waferSurface:    body.waferSurface    || null,
        createdBy:      body.createdBy      || null,
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

    // 입력 검증
    if (body.type !== undefined && !VALID_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "구분은 입고/출고/불출 중 하나여야 합니다." }, { status: 400 });
    }
    if (body.quantity !== undefined && Number(body.quantity) <= 0) {
      return NextResponse.json({ error: "수량은 1 이상이어야 합니다." }, { status: 400 });
    }
    if (body.date !== undefined && isNaN(new Date(body.date).getTime())) {
      return NextResponse.json({ error: "유효한 날짜를 입력해주세요." }, { status: 400 });
    }

    const tx = await prisma.inventoryTx.update({
      where: { id: Number(id) },
      data: {
        date:           body.date ? new Date(body.date) : undefined,
        type:           body.type           ?? undefined,
        itemId:         body.itemId         ?? undefined,
        quantity:       body.quantity       ?? undefined,
        unitPrice:      body.unitPrice      ?? undefined,
        currency:       body.currency       ?? undefined,
        amount:         body.amount         ?? undefined,
        partnerId:      body.partnerId      ?? undefined,
        handlerName:    body.handlerName    ?? undefined,
        handlerContact: body.handlerContact ?? undefined,
        memo:           body.memo           ?? undefined,
        location:       body.location       ?? undefined,
        barcodeId:      body.barcodeId      ?? undefined,
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
