import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge Runtime용 — Prisma 없는 authConfig만 사용 (성능 유지)
// Prisma가 포함된 auth.ts는 Edge Runtime에서 실행 불가
const { auth } = NextAuth(authConfig);

// 포털에서 cross-origin으로 호출하는 endpoint
// CORS preflight(OPTIONS) 통과 + 401 응답에도 CORS 헤더 부여 대상
const PORTAL_ENDPOINTS = ["/api/portal-summary", "/api/portal-logs"];

// 응답에 CORS 헤더 부여 (포털 origin인 경우만)
function withCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  if (origin === "https://vanam.synology.me") {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return response;
}

export default auth((req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");
  const isPortalEndpoint = PORTAL_ENDPOINTS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // CORS preflight(OPTIONS) — 포털 endpoint에 한해 즉시 204 응답 (인증 체크 건너뜀)
  if (req.method === "OPTIONS" && isPortalEndpoint) {
    return withCorsHeaders(
      new NextResponse(null, { status: 204 }) as NextResponse,
      origin
    );
  }

  // /api/auth/* 는 next-auth 내부 경로 — 항상 허용
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // /api/internal/* 는 머신 토큰 인증 경로 — 세션 검사 건너뜀.
  // ⚠️ 실제 인증은 각 라우트가 requireInternalAuth(request)로 Bearer 토큰을
  // 직접 검증한다. 여기서 통과시키는 것은 "세션 쿠키가 없다고 401하지 말라"는
  // 뜻일 뿐, 무인증 통과가 아니다.
  if (pathname.startsWith("/api/internal")) {
    return NextResponse.next();
  }

  // /api/chamber-slots GET 은 Python 프로그램용 — 인증 없이 허용
  if (pathname === "/api/chamber-slots" && req.method === "GET") {
    return NextResponse.next();
  }

  // /api/* 전체: 미인증 시 401 JSON 반환 (API 클라이언트 대응)
  if (pathname.startsWith("/api/")) {
    if (!req.auth?.user) {
      const res = NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
      // 포털 endpoint면 401에도 CORS 헤더 부여 (브라우저가 응답을 읽을 수 있게)
      return isPortalEndpoint ? withCorsHeaders(res, origin) : res;
    }
    return NextResponse.next();
  }

  // 페이지 라우트: 미인증 시 포털 로그인 페이지로 리다이렉트
  // (재고관리 자체 /login 페이지는 없음, 로그인은 포털에서 담당)
  if (!req.auth?.user) {
    return NextResponse.redirect(
      new URL("/login", "https://vanam.synology.me")
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/api/((?!auth).*)",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
