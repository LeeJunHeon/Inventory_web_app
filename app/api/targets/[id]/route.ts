import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createDisposalTxForTarget } from "@/lib/txTypes";
import { logActivity } from "@/lib/auth-helpers";
import { targetUnitHeader } from "@/lib/logDetail";

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

    // 변경 전 상태 + 로그 헤더용 관계를 한 번에 조회 (404 판정과 diff에 함께 사용)
    // 타겟 전용 경로 — ALD 캐니스터를 이 API로 조작하지 못하도록 분류까지 확인한다
    // (캐니스터는 /api/ald/[id] 담당)
    const beforeTu = await prisma.targetUnit.findFirst({
      where:   { id, category: "sputter" },
      include: { barcodes: { take: 1, orderBy: { id: "asc" } }, item: true },
    });
    if (!beforeTu) {
      return NextResponse.json({ error: "타겟을 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.targetUnit.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(note   !== undefined && { note }),
        ...(status === "폐기" && { disposedAt: new Date() }),
      },
    });

    // 폐기 처리 시 연결된 바코드 비활성화
    if (status === "폐기") {
      await prisma.barcode.updateMany({
        where: { targetUnitId: id },
        data:  { isActive: "N" },
      });
    }

    const actorId = session.user.email
      ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null
      : null;

    // 폐기로 전이된 경우에만 재고 원장에 폐기 tx 자동 기록 (이미 있으면 스킵)
    if (status === "폐기" && beforeTu?.status !== "폐기") {
      await createDisposalTxForTarget({ targetUnitId: id, userId: actorId });
    }

    // activity_log 기록 (변경된 필드가 있을 때만)
    const ch: string[] = [];
    if (status !== undefined && beforeTu.status !== status)
      ch.push(`상태: ${beforeTu.status} → ${status}`);
    if (note !== undefined && (beforeTu.note ?? "") !== (note ?? ""))
      ch.push(`메모: ${beforeTu.note || "-"} → ${note || "-"}`);

    if (ch.length > 0) {
      await logActivity(
        actorId, "UPDATE", "target_unit", id,
        `${targetUnitHeader(beforeTu)} ${ch.join(" | ")}`
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/targets/[id] error:", error);
    return NextResponse.json({ error: "타겟 상태 변경 실패" }, { status: 500 });
  }
}
