// 포털 활동 로그(/api/portal-logs) 항목 → 재고 앱 화면 키(?page=) 계산. 순수 함수(prisma 없음).
import type { PageId } from "@/lib/menus";

/** tableName 만으로 화면이 정해지는 기록 */
const TABLE_PAGE = {
  inventory_tx: "inventory",
  item:         "items",
  partner:      "partners",
  barcode:      "barcode",
  user:         "admin",
  target_photo: "target", // 사진 첨부는 스퍼터 타겟만 허용(app/api/target-photos)
} satisfies Record<string, PageId>;

/** target_unit / target_log 는 ALD·스퍼터가 같은 이름을 쓰므로 TargetUnit.category 로 정한다 */
export const CATEGORY_TABLES = ["target_unit", "target_log"] as const;

export interface PortalLogRef {
  tableName: string;
  detail: string | null;
}

/**
 * 기록 → 화면 키. 정할 수 없으면 undefined(포털은 앱 첫 화면으로 연다).
 * category 는 target_unit 이면 그 타겟의, target_log 면 그 기록의 타겟 category.
 * 레코드가 지워졌거나 조회에 실패했으면 undefined 를 넘긴다.
 */
export function pageForLog(log: PortalLogRef, category?: string | null): PageId | undefined {
  if (Object.hasOwn(TABLE_PAGE, log.tableName)) {
    return TABLE_PAGE[log.tableName as keyof typeof TABLE_PAGE];
  }
  if ((CATEGORY_TABLES as readonly string[]).includes(log.tableName)) {
    if (category === "sputter") return "target";
    if (category === "ald") return "ald";
    return undefined;
  }
  if (log.tableName === "chamber_slot") {
    // ALD 포트 배정(app/api/ald/port-slots)도 "chamber_slot" 이름으로 남아 id 로는 구분할 수 없다.
    // 그 기록은 detail 이 "포트 배정"/"포트 비우기"로 시작한다.
    const d = log.detail ?? "";
    return d.startsWith("포트 배정") || d.startsWith("포트 비우기") ? "ald" : "target";
  }
  return undefined;
}
