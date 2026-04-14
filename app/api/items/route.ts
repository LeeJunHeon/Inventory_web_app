import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { auth } from "@/auth";

// GET /api/items
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "";
    const search   = searchParams.get("search")   || "";
    const showAll  = searchParams.get("showAll")  === "true";

    const where: any = {};

    if (!showAll) {
      where.isActive = true;
    }

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
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
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

    const session = await auth();
    if (session?.user?.email) {
      const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (actor) await prisma.activityLog.create({
        data: { userId: actor.id, action: "CREATE", tableName: "item", recordId: item.id },
      });
    }

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
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const body = await request.json();
    const { name, categoryId, unit, minStockQty, note } = body;

    const beforeItem = await prisma.item.findUnique({
      where: { id: Number(id) },
      include: { category: true },
    });

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

    const session = await auth();
    if (session?.user?.email) {
      const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (actor) await prisma.activityLog.create({
        data: { userId: actor.id, action: "UPDATE", tableName: "item", recordId: Number(id),
          detail: (() => {
            const ch: string[] = [];
            if (beforeItem) {
              if (name !== undefined && beforeItem.name !== name) ch.push(`품목명: ${beforeItem.name} → ${name}`);
              if (unit !== undefined && (beforeItem.unit ?? "") !== (unit ?? "")) ch.push(`단위: ${beforeItem.unit || "-"} → ${unit || "-"}`);
              if (note !== undefined && (beforeItem.note ?? "") !== (note ?? "")) ch.push(`비고: ${beforeItem.note || "-"} → ${note || "-"}`);
            }
            return ch.length > 0 ? ch.join(" | ") : undefined;
          })() || undefined,
        },
      });
    }

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
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const txCount = await prisma.inventoryTx.count({ where: { itemId: Number(id) } });
    if (txCount > 0) {
      return NextResponse.json({ error: "거래 내역이 있어 삭제할 수 없습니다." }, { status: 409 });
    }

    await prisma.item.delete({ where: { id: Number(id) } });

    const session = await auth();
    if (session?.user?.email) {
      const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (actor) await prisma.activityLog.create({
        data: { userId: actor.id, action: "DELETE", tableName: "item", recordId: Number(id) },
      });
    }

    return NextResponse.json({ message: "품목이 삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/items error:", error);
    return NextResponse.json({ error: "품목 삭제 실패" }, { status: 500 });
  }
}
