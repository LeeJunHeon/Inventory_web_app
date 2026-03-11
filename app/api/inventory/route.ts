import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/inventory — 재고 트랜잭션 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const category = searchParams.get("category") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const where: any = {};

    if (type && type !== "전체") {
      where.type = type;
    }

    if (category && category !== "전체") {
      where.item = { category: { name: category } };
    }

    if (startDate && endDate) {
      where.date = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    if (search) {
      where.OR = [
        { item: { name: { contains: search, mode: "insensitive" } } },
        { item: { code: { contains: search, mode: "insensitive" } } },
        { barcode: { code: { contains: search, mode: "insensitive" } } },
      ];
    }

    const transactions = await prisma.inventoryTx.findMany({
      where,
      include: {
        item: { include: { category: true } },
        partner: true,
        barcode: true,
        creator: true,
      },
      orderBy: { id: "desc" },
    });

    const result = transactions.map((tx) => ({
      id: tx.id,
      date: tx.date.toISOString().split("T")[0].replace(/-/g, "."),
      type: tx.type,
      category: tx.item.category.name,
      code: tx.item.code,
      name: tx.item.name,
      price: Number(tx.unitPrice),
      qty: tx.quantity,
      amount: Number(tx.amount),
      currency: tx.currency,
      partner: tx.partner?.name || "",
      handler: tx.handlerName || "",
      memo: tx.memo || "",
      barcode: tx.barcode?.code || "",
      location: tx.location || "",
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

    const tx = await prisma.inventoryTx.create({
      data: {
        date: new Date(body.date),
        type: body.type,
        itemId: body.itemId,
        quantity: body.quantity,
        unitPrice: body.unitPrice || 0,
        currency: body.currency || "KRW",
        amount: body.amount || 0,
        partnerId: body.partnerId || null,
        handlerName: body.handlerName || null,
        handlerContact: body.handlerContact || null,
        memo: body.memo || null,
        targetUnitId: body.targetUnitId || null,
        refInboundId: body.refInboundId || null,
        barcodeId: body.barcodeId || null,
        location: body.location || null,
        waferResistance: body.waferResistance || null,
        waferThickness: body.waferThickness || null,
        waferDirection: body.waferDirection || null,
        waferSurface: body.waferSurface || null,
        createdBy: body.createdBy || null,
      },
    });

    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    console.error("POST /api/inventory error:", error);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
