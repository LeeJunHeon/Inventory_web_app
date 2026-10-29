import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { WAFER_SPEC_KEYS, WAFER_SPEC_DEFAULT_OPTIONS, normalizeSpecText } from "@/lib/waferSpec";
import type { WaferSpecKey } from "@/lib/waferSpec";

export const dynamic = "force-dynamic";

// GET /api/items/wafer-spec-options — 웨이퍼 스펙 선택지
// 기본 선택지(순서 유지) 뒤에 wafer_spec 에 실제로 들어 있는 값 중 기본에 없는 것을 정렬해 붙인다.
// 직접 입력한 값이 다음부터 목록에 뜨게 하기 위함.
export async function GET() {
  try {
    const rows = await prisma.waferSpec.findMany({
      select: {
        orientation: true, diameterInch: true, waferType: true, dopant: true, grade: true,
        thicknessNote: true, resistivity: true, surface: true, oxidation: true,
      },
    });

    const result = {} as Record<WaferSpecKey, string[]>;
    for (const key of WAFER_SPEC_KEYS) {
      const defaults = WAFER_SPEC_DEFAULT_OPTIONS[key];
      const extra = new Set<string>();
      for (const row of rows) {
        const v = normalizeSpecText(row[key]);
        if (v && !defaults.includes(v)) extra.add(v);
      }
      const sorted = [...extra].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
      result[key] = [...defaults, ...sorted];
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/items/wafer-spec-options error:", error);
    return NextResponse.json({ error: "웨이퍼 스펙 선택지 조회 실패" }, { status: 500 });
  }
}
