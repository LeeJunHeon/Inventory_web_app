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

/** 세션 사용자 email + role 반환 */
export async function getSessionUser(): Promise<{ email: string; role: string } | AuthError> {
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
  return { email: session.user.email, role: user.role ?? "" };
}

/** 현재 세션 사용자의 DB id 반환. 미로그인이거나 없으면 null */
export async function getSessionUserId(): Promise<number | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  return user?.id ?? null;
}

/** 활동 로그 기록 헬퍼. userId가 null이면 아무것도 하지 않음 */
export async function logActivity(
  userId: number | null,
  action: "CREATE" | "UPDATE" | "DELETE",
  tableName: string,
  recordId: number,
  detail?: string
): Promise<void> {
  if (!userId) return;
  await prisma.activityLog.create({
    data: { userId, action, tableName, recordId, detail: detail ?? null },
  });
}
