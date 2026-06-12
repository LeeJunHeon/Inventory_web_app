import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeStringEqual(a: string, b: string): boolean {
  // 길이가 다르면 비교조차 하지 않음 — timingSafeEqual은 같은 길이만 허용
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * 내부 쓰기 전용 인증.
 *
 * - Authorization: Bearer <token>  → process.env.INVENTORY_WRITE_TOKEN 과 일치해야 함
 * - X-Acting-User-Email             → 행위자 식별 (쓰기는 신원 필수, 없으면 401)
 *
 * ⚠️ next-auth 세션이나 DISABLE_AUTH 우회를 타지 않음. 항상 머신 토큰을 실제로 검증.
 */
type WriteAuthResult =
  | { ok: true; actingUserId: number }
  | { ok: false; response: NextResponse };

async function requireWriteAuth(request: Request): Promise<WriteAuthResult> {
  const expected = process.env.INVENTORY_WRITE_TOKEN;

  // 토큰 자체가 서버에 설정 안 돼 있으면 절대 통과시키지 않음 (서버 설정 오류)
  if (!expected || expected.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "쓰기 토큰 미설정" },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim() ?? "";

  if (!token || !safeStringEqual(token, expected)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "인증 실패" }, { status: 401 }),
    };
  }

  // 쓰기는 신원 필수 — 헤더가 없으면 401
  const actingEmail = request.headers.get("x-acting-user-email")?.trim() || "";
  if (!actingEmail) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "행위자 이메일(x-acting-user-email)이 필요합니다." },
        { status: 401 }
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: actingEmail },
    select: { id: true, isActive: true },
  });
  if (!user || user.isActive === "N") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "행위자를 찾을 수 없거나 비활성 사용자입니다." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, actingUserId: user.id };
}

// POST /api/internal/barcodes — 내부 쓰기 전용 바코드 생성 (토큰 + acting-user 인증)
// 기존 app/api/barcodes POST 로직 복사, 인증만 세션 → 토큰으로 교체
export async function POST(request: NextRequest) {
  const authResult = await requireWriteAuth(request);
  if (!authResult.ok) return authResult.response;
  const actingUserId = authResult.actingUserId;
  try {
    const body = await request.json();
    const { itemId } = body;

    if (!itemId) {
      return NextResponse.json({ error: "itemId가 필요합니다." }, { status: 400 });
    }

    const item = await prisma.item.findUnique({
      where: { id: Number(itemId) },
      include: { category: true },
    });
    if (!item) {
      return NextResponse.json({ error: "품목을 찾을 수 없습니다." }, { status: 404 });
    }

    // BarcodeSeq를 이용한 순번 자동 생성
    const CATEGORY_PREFIX: Record<string, string> = { "타겟": "T", "웨이퍼": "W", "가스": "G", "기자재": "E", "ALD Canister": "C" };
    const prefix = CATEGORY_PREFIX[item.category.name] ?? item.category.name.charAt(0).toUpperCase();
    const seq = await prisma.barcodeSeq.upsert({
      where:  { prefix },
      update: { lastNo: { increment: 1 } },
      create: { prefix, lastNo: 1 },
    });
    const newCode = `${prefix}-${seq.lastNo}`;

    // 타겟 품목인 경우 TargetUnit + Barcode를 트랜잭션으로 원자적 생성
    if (item.category.name === "타겟") {
      const result = await prisma.$transaction(async (tx) => {
        const targetUnit = await tx.targetUnit.create({
          data: {
            itemId: item.id,
            status: "미사용",
          },
        });

        const barcode = await tx.barcode.create({
          data: {
            code:         newCode,
            itemId:       item.id,
            targetUnitId: targetUnit.id,
            isActive:     "Y",
          },
          include: { item: { include: { category: true } }, targetUnit: true },
        });

        return barcode;
      });

      await logActivity(actingUserId, "CREATE", "barcode", result.id);

      return NextResponse.json({
        id:       result.id,
        code:     result.code,
        itemCode: result.item?.code || "",
        itemName: result.item?.name || "",
        category: result.item?.category.name || "",
        targetId: result.targetUnit ? `TU-${String(result.targetUnit.id).padStart(3, "0")}` : "",
        isActive: result.isActive,
      }, { status: 201 });
    } else if (item.category.name === "ALD Canister") {
      const result = await prisma.$transaction(async (tx) => {
        // 1. target_unit 생성 (category = 'ald')
        const targetUnit = await tx.targetUnit.create({
          data: {
            itemId:   item.id,
            status:   "미사용",
            category: "ald",
            note:     body.memo || null,
          },
        });

        // 2. ald_canister_spec 생성 (aldTareWeight 필수)
        if (body.aldTareWeight) {
          await tx.aldCanisterSpec.create({
            data: {
              targetUnitId:       targetUnit.id,
              tareWeight:         Number(body.aldTareWeight),
              materialName:       body.aldMaterialName || null,
              initialGrossWeight: body.aldInitialGross ? Number(body.aldInitialGross) : null,
            },
          });
        }

        // 3. barcode 생성 (C prefix)
        const seq = await tx.barcodeSeq.upsert({
          where:  { prefix: "C" },
          update: { lastNo: { increment: 1 } },
          create: { prefix: "C", lastNo: 1 },
        });
        const newCode = `C-${seq.lastNo}`;

        const barcode = await tx.barcode.create({
          data: {
            code:         newCode,
            itemId:       item.id,
            targetUnitId: targetUnit.id,
            isActive:     "Y",
            memo:         body.memo || null,
          },
        });

        return { targetUnit, barcode };
      });

      return NextResponse.json(
        { id: result.barcode.id, code: result.barcode.code, targetUnitId: result.targetUnit.id },
        { status: 201 }
      );
    }

    // 타겟이 아닌 경우 바코드만 생성
    const barcode = await prisma.barcode.create({
      data: {
        code:         newCode,
        itemId:       item.id,
        targetUnitId: null,
        isActive:     "Y",
      },
      include: { item: { include: { category: true } }, targetUnit: true },
    });

    await logActivity(actingUserId, "CREATE", "barcode", barcode.id);

    return NextResponse.json({
      id:       barcode.id,
      code:     barcode.code,
      itemCode: barcode.item?.code || "",
      itemName: barcode.item?.name || "",
      category: barcode.item?.category.name || "",
      targetId: "",
      isActive: barcode.isActive,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/internal/barcodes error:", error);
    return NextResponse.json({ error: "바코드 생성 실패", detail: String(error) }, { status: 500 });
  }
}
