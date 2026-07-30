import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildInventoryTxDetail, formatTargetLogDetail } from "@/lib/logDetail";

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

/** all=true 조회 시 안전 상한 */
const ALL_MAX = 50000;
/** detail이 없는 과거 로그를 라이브 조회로 보완하는 최대 건수 (로그당 1쿼리 = N+1) */
const ENRICH_MAX = 2000;

// GET /api/logs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || "";
    const endDate   = searchParams.get("endDate")   || "";
    const userId    = searchParams.get("userId")    || "";
    const action    = searchParams.get("action")    || "";
    const tableName = searchParams.get("tableName") || "";
    const page      = Math.max(1, parseInt(searchParams.get("page")  || "1",  10));
    const limit     = Math.max(1, parseInt(searchParams.get("limit") || "50", 10));
    const skip      = (page - 1) * limit;
    // all=true → 페이지네이션 없이 필터 조건 전체 (CSV 내보내기용, 안전 상한 적용)
    const all       = searchParams.get("all") === "true";

    const andConditions: any[] = [];
    if (startDate) andConditions.push({ createdAt: { gte: new Date(startDate) } });
    if (endDate)   andConditions.push({ createdAt: { lte: new Date(endDate + "T23:59:59.999Z") } });
    if (userId)    andConditions.push({ userId: Number(userId) });
    if (action)    andConditions.push({ action });
    if (tableName) andConditions.push({ tableName });

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const skipTake: { skip: number; take: number } = all
      ? { skip: 0, take: ALL_MAX }
      : { skip, take: limit };

    const [total, logs, users] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        ...skipTake,
      }),
      prisma.user.findMany({
        where:   { isActive: "Y" },
        select:  { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    // 각 로그에 상세 정보 추가.
    // 기록 시점 스냅샷(log.detail)이 있으면 그대로 쓰고, 없는 과거 로그만 라이브 조회로 보완한다.
    const enrichLive = logs.length <= ENRICH_MAX;

    const enriched = await Promise.all(
      logs.map(async (log) => {
        let detail = "";
        try {
          if (log.detail) {
            detail = log.detail;
          } else if (!enrichLive) {
            // 대량 조회(CSV 전체 등)에서는 N+1 라이브 조회를 생략
            detail = `ID: ${log.recordId}`;
          } else if (log.tableName === "inventory_tx") {
            if (log.action === "DELETE") {
              detail = `전표 ID: ${log.recordId}`;
            } else {
              // 스냅샷을 남기기 전에 기록된 과거 로그 — 기록 시점과 같은 포맷터로 복원
              detail = (await buildInventoryTxDetail(log.recordId)) ?? "";
            }
          } else if (log.tableName === "target_log") {
            const tl = await prisma.targetLog.findUnique({
              where:   { id: log.recordId },
              include: {
                targetUnit: {
                  include: {
                    barcodes: { where: { isActive: "Y" }, take: 1 },
                    item:     true,
                  },
                },
                location: true,
              },
            });
            if (tl) detail = formatTargetLogDetail(tl);

          } else if (log.tableName === "partner") {
            try {
              const p = await prisma.partner.findUnique({ where: { id: log.recordId } });
              detail = p ? p.name : `ID: ${log.recordId}`;
            } catch { detail = `ID: ${log.recordId}`; }

          } else if (log.tableName === "item") {
            try {
              const it = await prisma.item.findUnique({ where: { id: log.recordId } });
              detail = it ? `${it.code} ${it.name}` : `ID: ${log.recordId}`;
            } catch { detail = `ID: ${log.recordId}`; }

          } else if (log.tableName === "barcode") {
            try {
              const bc = await prisma.barcode.findUnique({
                where: { id: log.recordId },
                include: { item: true },
              });
              detail = bc ? `${bc.code} (${bc.item?.name ?? "-"})` : `ID: ${log.recordId}`;
            } catch { detail = `ID: ${log.recordId}`; }

          } else if (log.tableName === "user") {
            try {
              const u = await prisma.user.findUnique({ where: { id: log.recordId } });
              detail = u ? `${u.name} (${u.email ?? "-"})` : `ID: ${log.recordId}`;
            } catch { detail = `ID: ${log.recordId}`; }

          } else if (log.tableName === "target_unit") {
            try {
              const tu = await prisma.targetUnit.findUnique({
                where: { id: log.recordId },
                include: {
                  barcodes: { where: { isActive: "Y" }, take: 1 },
                  item: true,
                },
              });
              if (tu) {
                const bc = tu.barcodes[0]?.code ?? "";
                detail = `${bc ? bc + " " : ""}${tu.item?.name ?? ""} → ${tu.status}`;
              } else {
                detail = `ID: ${log.recordId}`;
              }
            } catch { detail = `ID: ${log.recordId}`; }

          } else if (log.tableName === "chamber_slot") {
            try {
              const cs = await prisma.chamberSlot.findUnique({
                where: { id: log.recordId },
                include: {
                  location: true,
                  targetUnit: {
                    include: {
                      barcodes: { where: { isActive: "Y" }, take: 1 },
                      item: true,
                    },
                  },
                },
              });
              if (cs) {
                const loc  = cs.location?.name ?? "";
                const bc   = cs.targetUnit?.barcodes[0]?.code ?? "";
                const name = cs.targetUnit?.item?.name ?? "비어있음";
                detail = `${loc} → ${bc ? bc + " " : ""}${name}`;
              } else {
                detail = `ID: ${log.recordId}`;
              }
            } catch { detail = `ID: ${log.recordId}`; }
          }
        } catch { /* 삭제된 레코드 등은 무시 */ }

        return {
          id:         log.id,
          createdAt:  log.createdAt.toISOString(),
          userId:     log.userId,
          userName:   log.user?.name ?? "-",
          action:     log.action,
          actionLabel: ACTION_LABEL[log.action] ?? log.action,
          tableName:  log.tableName,
          tableLabel: TABLE_LABEL[log.tableName] ?? log.tableName,
          recordId:   log.recordId,
          detail,
        };
      })
    );

    return NextResponse.json({ data: enriched, total, page, limit, users });
  } catch (error) {
    console.error("GET /api/logs error:", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
