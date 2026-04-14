import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { auth } from "@/auth";

// GET /api/partners
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    const where: any = {};
    if (search) where.name = { contains: search, mode: "insensitive" };

    const partners = await prisma.partner.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(partners.map(p => ({
      id:          p.id,
      name:        p.name,
      managerName: p.managerName,
      contact:     p.contact,
      email:       p.email,
      isActive:    p.isActive,
    })));
  } catch (error) {
    console.error("GET /api/partners error:", error);
    return NextResponse.json({ error: "거래처 조회 실패" }, { status: 500 });
  }
}

// POST /api/partners — 거래처 등록
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const body = await request.json();
    const { name, managerName, contact, email } = body;

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
        managerName: managerName?.trim() || null,
        contact:     contact?.trim()     || null,
        email:       email?.trim()       || null,
      },
    });

    const session = await auth();
    if (session?.user?.email) {
      const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (actor) await prisma.activityLog.create({
        data: { userId: actor.id, action: "CREATE", tableName: "partner", recordId: partner.id },
      });
    }

    return NextResponse.json({
      id: partner.id, name: partner.name,
      managerName: partner.managerName, contact: partner.contact, email: partner.email,
      isActive: partner.isActive,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/partners error:", error);
    return NextResponse.json({ error: "거래처 등록 실패" }, { status: 500 });
  }
}

// PUT /api/partners?id=1 — 거래처 수정
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
    const { name, managerName, contact, email } = body;

    const beforeP = await prisma.partner.findUnique({ where: { id: Number(id) } });

    const partner = await prisma.partner.update({
      where: { id: Number(id) },
      data: {
        ...(name        !== undefined && { name:        name.trim() }),
        ...(managerName !== undefined && { managerName: managerName?.trim() || null }),
        ...(contact     !== undefined && { contact:     contact?.trim() || null }),
        ...(email       !== undefined && { email:       email?.trim() || null }),
      },
    });

    const session = await auth();
    if (session?.user?.email) {
      const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (actor) {
        const _partnerDetail = (() => {
          const ch: string[] = [];
          if (beforeP) {
            if (name !== undefined && beforeP.name !== name) ch.push(`거래처명: ${beforeP.name} → ${name}`);
            if (managerName !== undefined && (beforeP.managerName ?? "") !== (managerName ?? "")) ch.push(`담당자: ${beforeP.managerName || "-"} → ${managerName || "-"}`);
            if (contact !== undefined && (beforeP.contact ?? "") !== (contact ?? "")) ch.push(`연락처: ${beforeP.contact || "-"} → ${contact || "-"}`);
            if (email !== undefined && (beforeP.email ?? "") !== (email ?? "")) ch.push(`이메일: ${beforeP.email || "-"} → ${email || "-"}`);
          }
          return ch.length > 0 ? ch.join(" | ") : undefined;
        })() || undefined;
        if (_partnerDetail) {
          await prisma.activityLog.create({
            data: {
              userId: actor.id, action: "UPDATE", tableName: "partner", recordId: Number(id),
              detail: _partnerDetail,
            },
          });
        }
      }
    }

    return NextResponse.json({
      id: partner.id, name: partner.name,
      managerName: partner.managerName, contact: partner.contact, email: partner.email,
      isActive: partner.isActive,
    });
  } catch (error) {
    console.error("PUT /api/partners error:", error);
    return NextResponse.json({ error: "거래처 수정 실패" }, { status: 500 });
  }
}

// DELETE /api/partners?id=1 — 거래처 삭제
export async function DELETE(request: NextRequest) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const txCount = await prisma.inventoryTx.count({ where: { partnerId: Number(id) } });
    if (txCount > 0) {
      return NextResponse.json({ error: "거래 내역이 있어 삭제할 수 없습니다." }, { status: 409 });
    }

    await prisma.partner.delete({ where: { id: Number(id) } });

    const session = await auth();
    if (session?.user?.email) {
      const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (actor) await prisma.activityLog.create({
        data: { userId: actor.id, action: "DELETE", tableName: "partner", recordId: Number(id) },
      });
    }

    return NextResponse.json({ message: "거래처가 삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/partners error:", error);
    return NextResponse.json({ error: "거래처 삭제 실패" }, { status: 500 });
  }
}
