import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { requireAuth, getSessionUserId, logActivity } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// 포트에 배정할 수 없는 Canister 상태 (TargetUnit.status). 배정하면 status 가 "사용중"으로 되살아나므로 막는다.
const UNASSIGNABLE_STATUSES = ["폐기", "판매완료"];

// GET /api/ald/port-slots
// 전체 포트 현황 반환 (장착된 Canister 정보 포함)
export async function GET() {
  try {
    const slots = await prisma.aldPortSlot.findMany({
      orderBy: [{ equipmentName: "asc" }, { portNumber: "asc" }],
      include: {
        targetUnit: {
          include: {
            barcodes:        { where: { isActive: "Y" }, take: 1 },
            aldCanisterSpec: true,
            targetLogs: {
              orderBy: { loggedAt: "desc" },
              take: 1,
              include: { aldLogDetail: true },
            },
          },
        },
      },
    });

    return NextResponse.json(slots.map(slot => {
      const tu       = slot.targetUnit;
      const spec     = tu?.aldCanisterSpec;
      const lastLog  = tu?.targetLogs[0];
      const lastDetail = lastLog?.aldLogDetail;

      return {
        id:            slot.id,
        equipmentName: slot.equipmentName,
        portNumber:    slot.portNumber,
        canisterId:    tu?.id ?? null,
        canisterCode:  tu?.barcodes[0]?.code ?? null,
        materialName:  spec?.materialName ?? null,
        remainPercent: lastDetail?.remainPercent
                         ? Number(lastDetail.remainPercent) : null,
        loadedAt:      slot.loadedAt?.toISOString() ?? null,
        note:          slot.note ?? null,
      };
    }));
  } catch (error) {
    console.error("GET /api/ald/port-slots error:", error);
    return NextResponse.json({ error: "포트 현황 조회 실패" }, { status: 500 });
  }
}

// 트랜잭션 안에서 응답 코드를 정해 밖으로 넘기는 오류 (던지면 트랜잭션은 롤백된다)
class PortSlotError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** 양의 정수(숫자 또는 숫자 문자열)면 그 값, 아니면 null */
function parsePositiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v
    : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim())
    : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** 기록 문구용 Canister 표시: 바코드가 있으면 "Canister {바코드} (#id)", 없으면 "Canister #id" */
function canisterLabel(id: number, code: string | null): string {
  return code ? `Canister ${code} (#${id})` : `Canister #${id}`;
}

// PUT /api/ald/port-slots
// { slotId, canisterId }        → 포트에 Canister 배정 (canisterId=null이면 비우기)
// 다른 포트 비우기 → 대상 포트 배정/비우기 → Canister 상태 변경을 한 트랜잭션으로 묶어 일부만 반영되지 않게 한다.
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  let body: { slotId?: unknown; canisterId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 입력 검증 (트랜잭션 전)
  const slotId = parsePositiveInt(body?.slotId);
  if (slotId === null) {
    return NextResponse.json({ error: "slotId가 필요합니다." }, { status: 400 });
  }
  const rawCanister = body.canisterId;
  const isClear = rawCanister === null || rawCanister === undefined || rawCanister === "";
  const canisterId = isClear ? null : parsePositiveInt(rawCanister);
  if (!isClear && canisterId === null) {
    return NextResponse.json({ error: "canisterId가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const sessionUserId = await getSessionUserId();

    const { updated, canisterCode, previous } = await prisma.$transaction(async (tx) => {
      // 포트 확인 + 비우기 전에 장착돼 있던 Canister(기록 문구용)
      const slot = await tx.aldPortSlot.findUnique({
        where: { id: slotId },
        select: {
          targetUnit: {
            select: { id: true, barcodes: { where: { isActive: "Y" }, take: 1, select: { code: true } } },
          },
        },
      });
      if (!slot) throw new PortSlotError(404, "포트를 찾을 수 없습니다");

      let code: string | null = null;
      if (canisterId !== null) {
        const tu = await tx.targetUnit.findUnique({
          where: { id: canisterId },
          select: {
            category: true,
            status:   true,
            barcodes: { where: { isActive: "Y" }, take: 1, select: { code: true } },
          },
        });
        if (!tu) throw new PortSlotError(404, "Canister 를 찾을 수 없습니다");
        // 화면(AldPrecursorPage)의 배정 후보는 /api/ald 의 ALD Canister 뿐이다
        if (tu.category !== "ald") throw new PortSlotError(400, "ALD Canister 만 포트에 배정할 수 있습니다");
        // 폐기·판매완료 Canister 는 배정 불가. 이미 그 포트에 장착된 같은 Canister 를 다시 저장하는 경우도 거절한다
        // (정상 흐름에서는 폐기 시 포트가 비워지지만 과거 데이터로 남아 있을 수 있고, 허용하면 아래에서 "사용중"으로 되살아난다).
        // 그런 포트는 "비우기"로 정리한다.
        if (UNASSIGNABLE_STATUSES.includes(tu.status)) {
          throw new PortSlotError(400, "폐기·판매완료된 Canister 는 포트에 배정할 수 없습니다");
        }
        code = tu.barcodes[0]?.code ?? null;

        // 같은 Canister가 다른 포트에 있으면 먼저 비우기 (같은 포트 재배정이면 자기 자신을 비웠다가 다시 채운다)
        await tx.aldPortSlot.updateMany({
          where: { targetUnitId: canisterId },
          data:  { targetUnitId: null, loadedAt: null },
        });
      }

      const row = await tx.aldPortSlot.update({
        where: { id: slotId },
        data: {
          targetUnitId:  canisterId,
          loadedAt:      canisterId !== null ? new Date() : null,
          updatedById:   sessionUserId ?? null,
        },
      });

      // Canister 상태 → 사용중 (배정 시)
      if (canisterId !== null) {
        await tx.targetUnit.update({
          where: { id: canisterId },
          data:  { status: "사용중" },
        });
      }

      const prev = slot.targetUnit;
      return {
        updated: row,
        canisterCode: code,
        previous: prev ? { id: prev.id, code: prev.barcodes[0]?.code ?? null } : null,
      };
    });

    // 기록은 트랜잭션이 성공한 뒤에만 (기록 실패가 배정을 취소하지 않게 — logActivity 는 throw 하지 않는다)
    // 다른 포트 자동 비우기·Canister 상태 변경은 따로 기록하지 않는다
    const port = `${updated.equipmentName} P${updated.portNumber}`;
    const detail = canisterId !== null
      ? `포트 배정: ${port} → ${canisterLabel(canisterId, canisterCode)}`
      : previous
        ? `포트 비우기: ${port} → 비어있음 (이전 Canister ${previous.code ?? `#${previous.id}`})`
        : `포트 비우기: ${port}`;
    await logActivity(sessionUserId, "UPDATE", "ald_port_slot", slotId, detail);

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof PortSlotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // 동시 요청으로 같은 Canister 가 두 포트에 들어가려 하면 target_unit_id unique 충돌 → 트랜잭션 롤백
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "다른 사용자가 먼저 변경했습니다. 새로고침 후 다시 시도하세요" },
        { status: 409 },
      );
    }
    console.error("PUT /api/ald/port-slots error:", error);
    return NextResponse.json({ error: "포트 설정 실패" }, { status: 500 });
  }
}
