// 웨이퍼 스펙 서버 전용 헬퍼 (prisma 사용). 클라이언트에서 import 금지 — 공용은 lib/waferSpec.ts
import { prisma } from "@/lib/prisma";
import {
  WAFER_CATEGORY, WAFER_SPEC_LABELS, WAFER_SPEC_TEXT_KEYS, WAFER_SPEC_TEXT_MAX,
  WAFER_DIAMETER_MIN, WAFER_DIAMETER_MAX,
  normalizeSpecText, parseDiameterFromCode, hasOrientation,
} from "@/lib/waferSpec";
import type { WaferSpecValues } from "@/lib/waferSpec";

/** 검증을 통과한 저장용 값 — 직경은 DB NOT NULL 이라 항상 숫자 */
export type WaferSpecData = WaferSpecValues & { diameterInch: number };

type ValidateResult = { ok: true; data: WaferSpecData } | { ok: false; error: string };

/**
 * 웨이퍼 스펙 입력 검증·정규화.
 * - input 의 키가 undefined 면 before 값을 유지(수정 시), null 또는 "" 면 비운다.
 * - 방향·직경은 비울 수 없다. 직경이 비면 품목코드(W-4-…)에서 채우고, 그래도 없으면 에러.
 */
export function validateWaferSpecInput(
  input: unknown,
  { itemCode, before }: { itemCode: string; before?: Partial<WaferSpecValues> | null },
): ValidateResult {
  if (input != null && (typeof input !== "object" || Array.isArray(input))) {
    return { ok: false, error: "웨이퍼 스펙 형식이 올바르지 않습니다." };
  }
  const src = (input ?? {}) as Record<string, unknown>;

  const text = {} as Record<(typeof WAFER_SPEC_TEXT_KEYS)[number], string | null>;
  for (const key of WAFER_SPEC_TEXT_KEYS) {
    const raw = src[key];
    if (raw !== undefined && raw !== null && typeof raw !== "string" && typeof raw !== "number") {
      return { ok: false, error: `${WAFER_SPEC_LABELS[key]} 값의 형식이 올바르지 않습니다.` };
    }
    const v = raw === undefined ? normalizeSpecText(before?.[key]) : normalizeSpecText(raw);
    if (v && v.length > WAFER_SPEC_TEXT_MAX) {
      return { ok: false, error: `${WAFER_SPEC_LABELS[key]}은(는) ${WAFER_SPEC_TEXT_MAX}자 이하로 입력해주세요.` };
    }
    text[key] = v;
  }
  if (!text.orientation) {
    return { ok: false, error: "방향을 입력해주세요. 결정 방향이 없는 웨이퍼는 \"해당 없음\"을 선택하세요." };
  }

  let diameter: number | null;
  const rawDia = src.diameterInch;
  if (rawDia === undefined) {
    diameter = before?.diameterInch ?? null;
  } else if (rawDia === null || (typeof rawDia === "string" && rawDia.trim() === "")) {
    diameter = null;
  } else {
    const s = typeof rawDia === "number" ? String(rawDia) : typeof rawDia === "string" ? rawDia.trim() : "";
    const n = /^\d+$/.test(s) ? Number(s) : NaN;
    if (!Number.isInteger(n) || n < WAFER_DIAMETER_MIN || n > WAFER_DIAMETER_MAX) {
      return { ok: false, error: `직경은 ${WAFER_DIAMETER_MIN}~${WAFER_DIAMETER_MAX} 사이의 정수(inch)로 입력해주세요.` };
    }
    diameter = n;
  }
  diameter ??= parseDiameterFromCode(itemCode);
  if (diameter == null) {
    return { ok: false, error: "직경을 입력해주세요." };
  }

  return { ok: true, data: { ...text, diameterInch: diameter } as WaferSpecData };
}

/** item 기준 스펙 검색 조건 (1:1 optional relation 이라 is 사용) */
export function waferSpecSearchWhere(query: string, exact: boolean) {
  const match = exact
    ? { equals: query, mode: "insensitive" as const }
    : { contains: query, mode: "insensitive" as const };
  return {
    waferSpec: {
      is: {
        OR: [
          { orientation:   match },
          { waferType:     match },
          { dopant:        match },
          { grade:         match },
          { thicknessNote: match },
          { resistivity:   match },
          { surface:       match },
          { oxidation:     match },
        ],
      },
    },
  };
}

/** 방향 미입력(또는 스펙 행 없음) 웨이퍼면 입고 차단 사유, 아니면 null */
export async function getWaferInboundBlockReason(itemId: number): Promise<string | null> {
  if (!Number.isInteger(itemId)) return null;
  const item = await prisma.item.findUnique({
    where:  { id: itemId },
    select: { code: true, category: { select: { name: true } }, waferSpec: { select: { orientation: true } } },
  });
  if (!item || item.category.name !== WAFER_CATEGORY) return null;
  if (hasOrientation(item.waferSpec)) return null;
  return `웨이퍼 품목 "${item.code}"은(는) 방향이 입력되지 않아 입고할 수 없습니다. 품목관리에서 방향을 먼저 입력해주세요.`;
}
