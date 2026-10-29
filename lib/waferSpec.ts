// 웨이퍼 스펙(wafer_spec, 품목 1:1) 공용 상수·포맷터.
// ⚠️ 클라이언트 컴포넌트에서도 import 하므로 prisma 등 서버 전용 모듈을 import 하지 말 것.
//    서버 전용 검증·조회는 lib/waferSpecServer.ts
import type { Messages } from "@/messages/ko";

export const WAFER_CATEGORY = "웨이퍼";

/** 표시·비교 순서 — 방향이 맨 앞 */
export const WAFER_SPEC_KEYS = [
  "orientation", "diameterInch", "waferType", "dopant", "grade",
  "thicknessNote", "resistivity", "surface", "oxidation",
] as const;
export type WaferSpecKey = (typeof WAFER_SPEC_KEYS)[number];
export type WaferSpecTextKey = Exclude<WaferSpecKey, "diameterInch">;
export const WAFER_SPEC_TEXT_KEYS = WAFER_SPEC_KEYS.filter(
  (k): k is WaferSpecTextKey => k !== "diameterInch"
);

export const WAFER_SPEC_LABELS: Record<WaferSpecKey, string> = {
  orientation:   "방향",
  diameterInch:  "직경",
  waferType:     "타입",
  dopant:        "도펀트",
  grade:         "등급",
  thicknessNote: "두께",
  resistivity:   "비저항",
  surface:       "표면",
  oxidation:     "산화막",
};

/** 화면 표시용 라벨 (i18n). 서버 로그·요약 문자열은 위 한국어 라벨을 쓴다. */
export function waferSpecLabelsT(t: Messages): Record<WaferSpecKey, string> {
  return {
    orientation:   t.tx.waferOrient,
    diameterInch:  t.tx.waferDiam,
    waferType:     t.tx.waferType,
    dopant:        t.tx.waferDopant,
    grade:         t.tx.waferGrade,
    thicknessNote: t.tx.waferThick,
    resistivity:   t.tx.waferResist,
    surface:       t.tx.waferSurface,
    oxidation:     t.tx.waferOxidation,
  };
}

/** 요약 문자열(labeled=false)에서 방향이 비어 있을 때 맨 앞에 붙는 표시 */
export const ORIENTATION_MISSING_MARK = "방향 미입력";

/** 방향 선택지 중 "결정 방향 없음" 값 */
export const ORIENTATION_NONE = "해당 없음";

/** 기본 선택지. 두께·비저항은 자유 입력이라 비어 있다. */
export const WAFER_SPEC_DEFAULT_OPTIONS: Record<WaferSpecKey, string[]> = {
  orientation:   ["<100>", "<110>", "<111>", ORIENTATION_NONE],
  diameterInch:  ["2", "3", "4", "5", "6", "8", "12"],
  waferType:     ["P", "P+", "P++", "N", "N+", "N++"],
  dopant:        ["Boron", "Phosphorus", "Arsenic", "Antimony"],
  grade:         ["Prime", "Test", "Monitor", "Dummy"],
  thicknessNote: [],
  resistivity:   [],
  surface:       ["SSP", "DSP"],
  oxidation:     ["100nm-Dry", "100nm-Wet", "200nm-Dry", "200nm-Wet", "300nm-Dry", "300nm-Wet"],
};

export const WAFER_SPEC_TEXT_MAX = 100;
export const WAFER_DIAMETER_MIN = 1;
export const WAFER_DIAMETER_MAX = 30;

export type WaferSpecValues = {
  orientation:   string | null;
  diameterInch:  number | null;
  waferType:     string | null;
  dopant:        string | null;
  grade:         string | null;
  thicknessNote: string | null;
  resistivity:   string | null;
  surface:       string | null;
  oxidation:     string | null;
};

/** DB 행(itemId 등 포함 가능)에서 9개 스펙 칸만 뽑는다. 행이 없으면 null */
export function pickWaferSpec(ws: Partial<WaferSpecValues> | null | undefined): WaferSpecValues | null {
  if (!ws) return null;
  return {
    orientation:   ws.orientation   ?? null,
    diameterInch:  ws.diameterInch  ?? null,
    waferType:     ws.waferType     ?? null,
    dopant:        ws.dopant        ?? null,
    grade:         ws.grade         ?? null,
    thicknessNote: ws.thicknessNote ?? null,
    resistivity:   ws.resistivity   ?? null,
    surface:       ws.surface       ?? null,
    oxidation:     ws.oxidation     ?? null,
  };
}

/** 품목코드 W-4-… 에서 직경(inch)을 읽는다. 없거나 범위 밖이면 null (예: W-SiC-4H-TEXAS1) */
export function parseDiameterFromCode(code: string | null | undefined): number | null {
  const m = /^W-(\d{1,2})-/.exec(code ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return n >= WAFER_DIAMETER_MIN && n <= WAFER_DIAMETER_MAX ? n : null;
}

/** 앞뒤 공백 제거, 연속 공백 1개로, 빈 문자열은 null. (100자 제한은 서버 검증에서) */
export function normalizeSpecText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s === "" ? null : s;
}

/** 방향이 입력돼 있는지 — 행이 없거나 비어 있으면 false */
export function hasOrientation(ws: Partial<WaferSpecValues> | null | undefined): boolean {
  return !!normalizeSpecText(ws?.orientation);
}

function displayValue(key: WaferSpecKey, ws: Partial<WaferSpecValues>): string | null {
  if (key === "diameterInch") return ws.diameterInch ? `${ws.diameterInch}"` : null;
  return normalizeSpecText(ws[key]);
}

/**
 * 스펙 요약 문자열. 방향을 맨 앞에 두고 빈 값은 생략한다.
 * - labeled=false: `<100> · 4" · P · Boron` (방향이 없으면 맨 앞에 "방향 미입력")
 * - labeled=true : `방향: <100> | 직경: 4" | 타입: P` (재고관리 itemSpec 형식)
 * 행이 없으면(null) labeled=false 는 "방향 미입력", labeled=true 는 null.
 * omitOrientation=true 면 방향을 빼고(미입력 표시도 없이) 나머지만 — 방향을 별도 열로 보여줄 때.
 */
export function formatWaferSpecSummary(
  ws: Partial<WaferSpecValues> | null | undefined,
  { labeled, omitOrientation = false }: { labeled: boolean; omitOrientation?: boolean },
): string | null {
  if (!ws) return labeled || omitOrientation ? null : ORIENTATION_MISSING_MARK;
  const parts: string[] = [];
  for (const key of WAFER_SPEC_KEYS) {
    if (omitOrientation && key === "orientation") continue;
    const v = displayValue(key, ws);
    if (v) parts.push(labeled ? `${WAFER_SPEC_LABELS[key]}: ${v}` : v);
  }
  if (labeled) return parts.length > 0 ? parts.join(" | ") : null;
  if (omitOrientation) return parts.length > 0 ? parts.join(" · ") : null;
  if (!hasOrientation(ws)) parts.unshift(ORIENTATION_MISSING_MARK);
  return parts.join(" · ");
}

// LogPage parseDiff 가 " | " 와 " → " 로 쪼개므로 값 안의 같은 문자열은 "/" 로 바꾼다
function diffSafe(v: string | null): string {
  return v ? v.replace(/ \| | → /g, "/") : "-";
}

/** 변경된 칸만 ["방향: - → <100>", ...] (빈 값은 "-") */
export function diffWaferSpec(
  before: Partial<WaferSpecValues> | null | undefined,
  after: Partial<WaferSpecValues> | null | undefined,
): string[] {
  const b = before ?? {};
  const a = after ?? {};
  const out: string[] = [];
  for (const key of WAFER_SPEC_KEYS) {
    const bv = displayValue(key, b);
    const av = displayValue(key, a);
    if (bv !== av) out.push(`${WAFER_SPEC_LABELS[key]}: ${diffSafe(bv)} → ${diffSafe(av)}`);
  }
  return out;
}
