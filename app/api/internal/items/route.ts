import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireInternalAuth } from "@/lib/internal-auth";
import { logActivity } from "@/lib/auth-helpers";
import { formatItemDetail } from "@/lib/logDetail";

export const dynamic = "force-dynamic";

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

// GET /api/internal/items?search=&category=
// 기존 app/api/items GET 로직 재사용 (ALD 계층 처리 포함, 기본 isActive=true)
export async function GET(request: NextRequest) {
  const authResult = await requireInternalAuth(request);
  if (!authResult.ok) return authResult.response;

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
      // ALD 조회 시 서브 카테고리(ALD Canister, ALD Precursor 등) 포함
      where.category = category === "ALD"
        ? {
            OR: [
              { name: "ALD" },
              { parent: { name: "ALD" } },
            ],
          }
        : { name: category };
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
    })));
  } catch (error) {
    console.error("GET /api/internal/items error:", error);
    return NextResponse.json({ error: "품목 조회 실패" }, { status: 500 });
  }
}

// POST /api/internal/items — 내부 쓰기 전용 품목 등록 (토큰 + acting-user 인증)
// 기존 app/api/items POST 로직 복사, 인증만 세션 → 토큰으로 교체
export async function POST(request: NextRequest) {
  const authResult = await requireWriteAuth(request);
  if (!authResult.ok) {
    return authResult.response;
  }
  try {
    const actingUserId = authResult.actingUserId;

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

    await logActivity(actingUserId, "CREATE", "item", item.id, formatItemDetail(item));

    return NextResponse.json({
      id: item.id, code: item.code, name: item.name,
      category: item.category.name, categoryId: item.categoryId,
      unit: item.unit, minStockQty: item.minStockQty, note: item.note,
      isActive: item.isActive,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/internal/items error:", error);
    return NextResponse.json({ error: "품목 등록 실패" }, { status: 500 });
  }
}
