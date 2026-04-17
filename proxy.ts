import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge Runtime용 — Prisma 없는 authConfig만 사용 (성능 유지)
// Prisma가 포함된 auth.ts는 Edge Runtime에서 실행 불가
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

  // /api/* 전체: 미인증 시 401 JSON 반환 (API 클라이언트 대응)
  if (pathname.startsWith("/api/")) {
    if (!req.auth?.user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
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
