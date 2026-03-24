import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Edge Runtime에서 실행 — Prisma 없는 authConfig만 사용
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // /login 과 /api/auth/* 는 인증 없이 접근 허용
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return;
  }

  // 미인증 상태: /login 으로 리디렉트
  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
