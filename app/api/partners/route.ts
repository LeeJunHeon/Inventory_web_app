import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/partners
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type   = searchParams.get("type")   || "";  // "vendor" | "disburse"
    const search = searchParams.get("search") || "";

    const where: any = { isActive: true };
    if (type)   where.type = type;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const partners = await prisma.partner.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(partners.map(p => ({
      id:          p.id,
      name:        p.name,
      type:        p.type,
      managerName: p.managerName,
      contact:     p.contact,
      isActive:    p.isActive,
    })));
  } catch (error) {
    console.error("GET /api/partners error:", error);
    return NextResponse.json({ error: "거래처 조회 실패" }, { status: 500 });
  }
}

// POST /api/partners — 거래처 등록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, managerName, contact } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "거래처명은 필수입니다." }, { status: 400 });
    }

    const exists = await prisma.partner.findUnique({ where: { name: name.trim() } });
    if (exists) {
      return NextResponse.json({ error: `"${name}" 거래처가 이미 존재합니다.` }, { status: 409 });
    }

    const partner = await prisma.partner.create({
      data: {
        name:        name.trim(),
        type:        type || "vendor",
        managerName: managerName?.trim() || null,
        contact:     contact?.trim()     || null,
        isActive:    true,
      },
    });

    return NextResponse.json(partner, { status: 201 });
  } catch (error) {
    console.error("POST /api/partners error:", error);
    return NextResponse.json({ error: "거래처 등록 실패" }, { status: 500 });
  }
}

// PUT /api/partners?id=1 — 거래처 수정
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const body = await request.json();
    const { name, type, managerName, contact, isActive } = body;

    if (type !== undefined && !["vendor", "disburse"].includes(type)) {
      return NextResponse.json({ error: "type은 vendor 또는 disburse여야 합니다." }, { status: 400 });
    }

    const partner = await prisma.partner.update({
      where: { id: Number(id) },
      data: {
        ...(name        !== undefined && { name:        name.trim() }),
        ...(type        !== undefined && { type }),
        ...(managerName !== undefined && { managerName: managerName?.trim() || null }),
        ...(contact     !== undefined && { contact:     contact?.trim() || null }),
        ...(isActive    !== undefined && { isActive }),
      },
    });

    return NextResponse.json(partner);
  } catch (error) {
    console.error("PUT /api/partners error:", error);
    return NextResponse.json({ error: "거래처 수정 실패" }, { status: 500 });
  }
}

// DELETE /api/partners?id=1 — 거래처 비활성화
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const txCount = await prisma.inventoryTx.count({ where: { partnerId: Number(id) } });
    if (txCount > 0) {
      await prisma.partner.update({ where: { id: Number(id) }, data: { isActive: false } });
      return NextResponse.json({ message: "거래 내역이 있어 비활성화 처리되었습니다." });
    }

    await prisma.partner.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "거래처가 삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/partners error:", error);
    return NextResponse.json({ error: "거래처 삭제 실패" }, { status: 500 });
  }
}
