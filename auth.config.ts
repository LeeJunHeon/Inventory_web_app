import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const isLocal = !process.env.NEXTAUTH_URL ||
  process.env.NEXTAUTH_URL.includes("localhost");

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
    signIn: isLocal ? "/login" : "https://vanam.synology.me/login",
  },
  // SSO 핵심: 포털과 동일한 쿠키 이름/도메인을 사용해야
  // 포털에서 발급한 세션 쿠키를 재고관리 앱이 읽을 수 있다
  // 로컬 환경에서는 기본 쿠키 설정 사용
  ...(isLocal
    ? {}
    : {
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
      }),
};
