import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type AuthError = { error: string; status: 401 | 403 };

/** 로그인 여부만 확인 */
export async function requireAuth(): Promise<{ email: string } | AuthError> {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "로그인이 필요합니다.", status: 401 };
  }
  return { email: session.user.email };
}

/** admin 역할 확인 */
export async function requireAdmin(): Promise<{ role: string } | AuthError> {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "로그인이 필요합니다.", status: 401 };
  }
  const user = await prisma.user.findUnique({
    where:  { email: session.user.email },
    select: { role: true, isActive: true },
  });
  if (!user || user.isActive === "N") {
    return { error: "접근 권한이 없습니다.", status: 403 };
  }
  if (user.role !== "admin") {
    return { error: "관리자만 접근 가능합니다.", status: 403 };
  }
  return { role: user.role };
}
