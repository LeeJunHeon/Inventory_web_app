import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge Runtime용 — Prisma 없는 authConfig만 사용 (성능 유지)
const { auth } = NextAuth(authConfig);

export default auth((req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;

  // /api/auth/* 는 next-auth 내부 경로 — 항상 허용
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // /api/chamber-slots GET 은 Python 프로그램용 — 인증 없이 허용
  if (pathname === "/api/chamber-slots" && req.method === "GET") {
    return NextResponse.next();
  }

  // /api/* 전체: 미인증 시 401 JSON 반환
  if (pathname.startsWith("/api/")) {
    if (!req.auth?.user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // 페이지 라우트: /login 은 항상 허용
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // 페이지 라우트: 미인증 시 /login 으로 리다이렉트
  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/api/((?!auth).*)",
    "/((?!_next/static|_next/image|favicon.ico|login).*)",
  ],
};
