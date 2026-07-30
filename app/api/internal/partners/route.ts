import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/auth-helpers";
import { formatPartnerDetail } from "@/lib/logDetail";
import { requireInternalAuth } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

// GET /api/internal/partners?search= — 거래처 이름 조회 (챗봇 거래처 입력용)
export async function GET(request: Request) {
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";

    const where: any = { isActive: true };
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const partners = await prisma.partner.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(partners);
  } catch (error) {
    console.error("GET /api/internal/partners error:", error);
    return NextResponse.json({ error: "거래처 조회 실패" }, { status: 500 });
  }
}

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

// POST /api/internal/partners — 내부 쓰기 전용 거래처 등록 (토큰 + acting-user 인증)
// 기존 app/api/partners POST 로직 복사, 인증만 세션 → 토큰으로 교체
export async function POST(request: NextRequest) {
  const authResult = await requireWriteAuth(request);
  if (!authResult.ok) {
    return authResult.response;
  }
  try {
    const actingUserId = authResult.actingUserId;

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

    await logActivity(actingUserId, "CREATE", "partner", partner.id, formatPartnerDetail(partner));

    return NextResponse.json({
      id: partner.id, name: partner.name,
      managerName: partner.managerName, contact: partner.contact, email: partner.email,
      isActive: partner.isActive,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/internal/partners error:", error);
    return NextResponse.json({ error: "거래처 등록 실패" }, { status: 500 });
  }
}
