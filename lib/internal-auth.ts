import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * MCP 서버 등 내부 시스템에서 호출하는 API용 인증 헬퍼.
 *
 * - Authorization: Bearer <token>  → process.env.MCP_API_TOKEN 과 일치해야 함
 * - X-Acting-User-Email             → 행위자 식별 (best-effort, 없어도 조회는 통과)
 *
 * ⚠️ 절대로 next-auth 세션이나 DISABLE_AUTH 우회를 타지 않음. 내부 API는 항상
 * 머신 토큰을 실제로 검증해야 한다.
 */
export type InternalAuthResult =
  | { ok: true; actingUserId: number | null; actingEmail: string | null }
  | { ok: false; response: NextResponse };

function safeStringEqual(a: string, b: string): boolean {
  // 길이가 다르면 비교조차 하지 않음 — timingSafeEqual은 같은 길이만 허용
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function requireInternalAuth(request: Request): Promise<InternalAuthResult> {
  const expected = process.env.MCP_API_TOKEN;

  // 토큰 자체가 서버에 설정 안 돼 있으면 절대 통과시키지 않음 (사고 방지)
  if (!expected || expected.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "MCP API 토큰 미설정" },
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

  // 행위자 신원 (best-effort)
  const rawEmail = request.headers.get("x-acting-user-email")?.trim() || "";
  const actingEmail = rawEmail.length > 0 ? rawEmail : null;
  let actingUserId: number | null = null;

  if (actingEmail) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: actingEmail },
        select: { id: true, isActive: true },
      });
      // 활성 사용자만 actingUserId로 인정. 없거나 비활성이면 null로 두되 차단은 안 함
      if (user && user.isActive !== "N") {
        actingUserId = user.id;
      }
    } catch {
      // best-effort: 신원 조회 실패는 무시
      actingUserId = null;
    }
  }

  return { ok: true, actingUserId, actingEmail };
}
