import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge Runtime에서 실행되는 미들웨어용 설정 (Prisma 미포함)
export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    // 미인증 접근 시 포털 로그인 페이지로 리다이렉트
    signIn: "https://vanam.synology.me/login",
  },
  // SSO 핵심: 포털과 동일한 쿠키 이름/도메인을 사용해야
  // 포털에서 발급한 세션 쿠키를 재고관리 앱이 읽을 수 있다
  cookies: {
    sessionToken: {
      name: "__Secure-authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: true,
        domain: ".vanam.synology.me",
      },
    },
  },
};
