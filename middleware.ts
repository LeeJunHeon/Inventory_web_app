import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth((req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;

  // /api/chamber-slots GET 요청은 인증 없이 허용 (Python 프로그램용)
  if (pathname === "/api/chamber-slots" && req.method === "GET") {
    return NextResponse.next();
  }

  // /api/ 로 시작하는 모든 요청: 세션 없으면 401 반환
  if (pathname.startsWith("/api/")) {
    if (!req.auth?.user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // 페이지 라우트: 세션 없으면 로그인 페이지로 리다이렉트
  if (!req.auth?.user && pathname !== "/login") {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // 모든 API 경로
    "/api/((?!auth).*)",
    // 페이지 경로 (정적 파일, _next 제외)
    "/((?!_next/static|_next/image|favicon.ico|login).*)",
  ],
};
