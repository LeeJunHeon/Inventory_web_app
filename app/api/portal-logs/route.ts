import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PageId } from "@/lib/menus";
import { pageForLog } from "@/lib/portalLogPage";

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
  target_photo: "타겟 사진",
};

const ACTION_LABEL: Record<string, string> = {
  CREATE: "등록",
  UPDATE: "수정",
  DELETE: "삭제",
};

/** id 목록 → 타겟 category. 조회에 실패하면 빈 Map(해당 항목만 page 없이 내려간다). */
async function unitCategories(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await prisma.targetUnit.findMany({
      where: { id: { in: ids } },
      select: { id: true, category: true },
    });
    return new Map(rows.map((r) => [r.id, r.category]));
  } catch (error) {
    console.error("GET /api/portal-logs targetUnit 조회 실패:", error);
    return new Map();
  }
}

async function logCategories(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await prisma.targetLog.findMany({
      where: { id: { in: ids } },
      select: { id: true, targetUnit: { select: { category: true } } },
    });
    return new Map(rows.map((r) => [r.id, r.targetUnit.category]));
  } catch (error) {
    console.error("GET /api/portal-logs targetLog 조회 실패:", error);
    return new Map();
  }
}

// GET /api/portal-logs?limit=5
// 포털 ActivityLog가 호출 — 최근 활동로그 간단 형태로 제공
// page 는 포털이 바로 열 재고 앱 화면(?page=). 정할 수 없으면 빠진다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "5", 10)));

    const logs = await prisma.activityLog.findMany({
      select: {
        id: true, tableName: true, action: true, recordId: true, detail: true, createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // 타겟 category 는 기록마다 조회하지 않고 종류별로 한 번에 모아 조회
    const idsOf = (table: string) => [...new Set(logs.filter((l) => l.tableName === table).map((l) => l.recordId))];
    const [unitCat, logCat] = await Promise.all([
      unitCategories(idsOf("target_unit")),
      logCategories(idsOf("target_log")),
    ]);

    const data = logs.map((log) => {
      const category =
        log.tableName === "target_unit" ? unitCat.get(log.recordId)
        : log.tableName === "target_log" ? logCat.get(log.recordId)
        : undefined;
      const page: PageId | undefined = pageForLog(log, category);
      return {
        id:         log.id,
        appName:    "재고 관리",
        tableLabel: TABLE_LABEL[log.tableName] ?? log.tableName,
        actionLabel: ACTION_LABEL[log.action] ?? log.action,
        userName:   log.user?.name ?? "-",
        occurredAt: log.createdAt.toISOString(),
        ...(page ? { page } : {}),
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/portal-logs error:", error);
    return NextResponse.json([]);
  }
}
