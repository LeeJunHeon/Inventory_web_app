import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUserId, logActivity } from "@/lib/auth-helpers";
import { createDisposalTxForTarget } from "@/lib/txTypes";
import { targetUnitHeader } from "@/lib/logDetail";

// GET /api/ald/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tu = await prisma.targetUnit.findUnique({
      where: { id: Number(id), category: "ald" },
      include: {
        barcodes:        { where: { isActive: "Y" }, take: 1 },
        aldCanisterSpec: true,
        item:            true,
      },
    });

    if (!tu) {
      return NextResponse.json({ error: "Canister를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      id:                 tu.id,
      barcodeCode:        tu.barcodes[0]?.code || "",
      itemCode:           tu.item?.code || "",
      itemName:           tu.item?.name || "",
      materialName:       tu.aldCanisterSpec?.materialName || "",
      status:             tu.status,
      tareWeight:         tu.aldCanisterSpec ? Number(tu.aldCanisterSpec.tareWeight) : null,
      initialGrossWeight: tu.aldCanisterSpec?.initialGrossWeight
                            ? Number(tu.aldCanisterSpec.initialGrossWeight) : null,
      note:               tu.note || "",
    });
  } catch (error) {
    console.error("GET /api/ald/[id] error:", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// PUT /api/ald/[id]
// { status: "폐기" }             → 폐기 처리
// { materialName: "TMA" }       → 물질명 수정
// { note: "메모" }              → 메모 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status, materialName, note } = body;

    const before = await prisma.targetUnit.findUnique({
      where: { id: Number(id) },
      include: { barcodes: { take: 1, orderBy: { id: "asc" } }, item: true },
    });
    if (!before) {
      return NextResponse.json({ error: "Canister를 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const tu = await tx.targetUnit.update({
        where: { id: Number(id) },
        data: {
          ...(status !== undefined && { status }),
          ...(note   !== undefined && { note }),
          ...(status === "폐기"    && { disposedAt: new Date() }),
        },
      });

      // 폐기 시 바코드 비활성화 + 포트 슬롯 비우기
      if (status === "폐기") {
        await tx.barcode.updateMany({
          where: { targetUnitId: Number(id) },
          data:  { isActive: "N" },
        });
        await tx.aldPortSlot.updateMany({
          where: { targetUnitId: Number(id) },
          data:  { targetUnitId: null, loadedAt: null },
        });
      }

      // 물질명 수정
      if (materialName !== undefined) {
        await tx.aldCanisterSpec.update({
          where: { targetUnitId: Number(id) },
          data:  { materialName, updatedAt: new Date() },
        });
      }

      return tu;
    });

    const sessionUserId = await getSessionUserId();

    // 폐기로 전이된 경우에만 재고 원장에 폐기 tx 자동 기록
    // (locationId는 함수가 사용중/입고 참조에서 결정 · 중복 방지 내장)
    if (status === "폐기" && before.status !== "폐기") {
      await createDisposalTxForTarget({
        targetUnitId: Number(id),
        userId:       sessionUserId ?? null,
      });
    }

    const changes: string[] = [];
    if (status !== undefined && before.status !== status)
      changes.push(`상태: ${before.status} → ${status}`);
    if (note !== undefined && (before.note ?? "") !== (note ?? ""))
      changes.push(`메모: ${before.note || "-"} → ${note || "-"}`);
    if (materialName !== undefined)
      changes.push(`물질명 → ${materialName}`);

    if (changes.length > 0)
      await logActivity(
        sessionUserId, "UPDATE", "target_unit", Number(id),
        `${targetUnitHeader(before)} ${changes.join(" | ")}`
      );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/ald/[id] error:", error);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}
