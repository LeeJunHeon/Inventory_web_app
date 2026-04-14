import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// PUT /api/targets/[id] — 타겟 상태 변경
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    const body = await request.json();
    const { status, note } = body;

    const target = await prisma.targetUnit.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "타겟을 찾을 수 없습니다." }, { status: 404 });
    }

    const beforeTu = await prisma.targetUnit.findUnique({ where: { id } });

    const updated = await prisma.targetUnit.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(note   !== undefined && { note }),
        ...(status === "disposed" && { disposedAt: new Date() }),
      },
    });

    // 폐기 처리 시 연결된 바코드 비활성화
    if (status === "disposed") {
      await prisma.barcode.updateMany({
        where: { targetUnitId: id },
        data:  { isActive: "N" },
      });
    }

    if (session.user.email) {
      const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (actor) await prisma.activityLog.create({
        data: { userId: actor.id, action: "UPDATE", tableName: "target_unit", recordId: id,
          detail: (() => {
            const ch: string[] = [];
            if (beforeTu) {
              if (status !== undefined && beforeTu.status !== status) ch.push(`상태: ${beforeTu.status} → ${status}`);
              if (note !== undefined && (beforeTu.note ?? "") !== (note ?? "")) ch.push(`메모: ${beforeTu.note || "-"} → ${note || "-"}`);
            }
            return ch.length > 0 ? ch.join(" | ") : undefined;
          })() || undefined,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/targets/[id] error:", error);
    return NextResponse.json({ error: "타겟 상태 변경 실패" }, { status: 500 });
  }
}
