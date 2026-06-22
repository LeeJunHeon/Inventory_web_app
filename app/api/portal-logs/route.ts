import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TABLE_LABEL: Record<string, string> = {
  inventory_tx: "재고 관리",
  target_log:   "타겟 사용현황",
  partner:      "거래처 관리",
  item:         "품목 관리",
  barcode:      "바코드",
  chamber_slot: "챔버별 타겟 현황",
  user:         "관리자 설정",
  target_unit:  "타겟 관리",
};

const ACTION_LABEL: Record<string, string> = {
  CREATE: "등록",
  UPDATE: "수정",
  DELETE: "삭제",
};

// GET /api/portal-logs?limit=5
// 포털 ActivityLog가 호출 — 최근 활동로그 간단 형태로 제공
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "5", 10)));

    const logs = await prisma.activityLog.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const data = logs.map((log) => ({
      id:         log.id,
      appName:    "재고 관리",
      tableLabel: TABLE_LABEL[log.tableName] ?? log.tableName,
      actionLabel: ACTION_LABEL[log.action] ?? log.action,
      userName:   log.user?.name ?? "-",
      occurredAt: log.createdAt.toISOString(),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/portal-logs error:", error);
    return NextResponse.json([]);
  }
}
