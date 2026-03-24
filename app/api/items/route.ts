import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/items
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "";
    const search   = searchParams.get("search")   || "";

    const where: any = {};

    if (category && category !== "전체") {
      where.category = { name: category };
    }
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: { code: "asc" },
    });

    return NextResponse.json(items.map((item) => ({
      id:          item.id,
      code:        item.code,
      name:        item.name,
      category:    item.category.name,
      categoryId:  item.categoryId,
      unit:        item.unit,
      minStockQty: item.minStockQty,
      note:        item.note,
      isActive:    item.isActive,
    })));
  } catch (error) {
    console.error("GET /api/items error:", error);
    return NextResponse.json({ error: "품목 조회 실패" }, { status: 500 });
  }
}

// POST /api/items — 품목 등록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name, categoryId, unit, minStockQty, note } = body;

    if (!code?.trim() || !name?.trim() || !categoryId) {
      return NextResponse.json({ error: "품목코드, 품목명, 품목군은 필수입니다." }, { status: 400 });
    }

    const exists = await prisma.item.findUnique({ where: { code: code.trim() } });
    if (exists) {
      return NextResponse.json({ error: `품목코드 "${code}"가 이미 존재합니다.` }, { status: 409 });
    }

    const item = await prisma.item.create({
      data: {
        code:        code.trim(),
        name:        name.trim(),
        categoryId:  Number(categoryId),
        unit:        unit?.trim() || null,
        minStockQty: Number(minStockQty) || 0,
        note:        note?.trim() || null,
      },
      include: { category: true },
    });

    return NextResponse.json({
      id: item.id, code: item.code, name: item.name,
      category: item.category.name, categoryId: item.categoryId,
      unit: item.unit, minStockQty: item.minStockQty, note: item.note,
      isActive: item.isActive,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/items error:", error);
    return NextResponse.json({ error: "품목 등록 실패" }, { status: 500 });
  }
}

// PUT /api/items?id=1 — 품목 수정
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const body = await request.json();
    const { name, categoryId, unit, minStockQty, note } = body;

    const item = await prisma.item.update({
      where: { id: Number(id) },
      data: {
        ...(name        !== undefined && { name:        name.trim() }),
        ...(categoryId  !== undefined && { categoryId:  Number(categoryId) }),
        ...(unit        !== undefined && { unit:        unit?.trim() || null }),
        ...(minStockQty !== undefined && { minStockQty: Number(minStockQty) }),
        ...(note        !== undefined && { note:        note?.trim() || null }),
      },
      include: { category: true },
    });

    return NextResponse.json({
      id: item.id, code: item.code, name: item.name,
      category: item.category.name, categoryId: item.categoryId,
      unit: item.unit, minStockQty: item.minStockQty, note: item.note,
      isActive: item.isActive,
    });
  } catch (error) {
    console.error("PUT /api/items error:", error);
    return NextResponse.json({ error: "품목 수정 실패" }, { status: 500 });
  }
}

// DELETE /api/items?id=1 — 품목 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const txCount = await prisma.inventoryTx.count({ where: { itemId: Number(id) } });
    if (txCount > 0) {
      return NextResponse.json({ error: "거래 내역이 있어 삭제할 수 없습니다." }, { status: 409 });
    }

    await prisma.item.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "품목이 삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/items error:", error);
    return NextResponse.json({ error: "품목 삭제 실패" }, { status: 500 });
  }
}
