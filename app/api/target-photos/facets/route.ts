import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";

// GET /api/target-photos/facets — 갤러리 필터 옵션(물질/크기/태그/상태별 장수)
// ⚠️ groupBy 객체는 각 호출부에 인라인으로 둔다 (target-photos/route.ts 상단 주석 참고).
export async function GET() {
  const authed = await getSessionUser();
  if ("error" in authed) {
    return NextResponse.json({ error: authed.error }, { status: authed.status });
  }
  try {
    const [materials, inches, tags, statuses] = await Promise.all([
      prisma.targetPhoto.groupBy({
        by: ["materialCode"],
        _count: { _all: true },
        where: { materialCode: { not: null } },
      }),
      prisma.targetPhoto.groupBy({
        by: ["diameterInch"],
        _count: { _all: true },
        where: { diameterInch: { not: null } },
      }),
      prisma.targetPhoto.groupBy({
        by: ["tag"],
        _count: { _all: true },
        where: { tag: { not: null } },
      }),
      prisma.targetPhoto.groupBy({
        by: ["matchStatus"],
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      materials: materials
        .map((m) => ({ code: m.materialCode as string, count: m._count._all }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      inches: inches
        .map((i) => ({ inch: i.diameterInch as number, count: i._count._all }))
        .sort((a, b) => a.inch - b.inch),
      tags: tags.map((t) => ({ tag: t.tag as string, count: t._count._all })),
      statuses: statuses.map((s) => ({ status: s.matchStatus as string, count: s._count._all })),
    });
  } catch (error) {
    console.error("GET /api/target-photos/facets error:", error);
    return NextResponse.json({ error: "사진 통계 조회 실패" }, { status: 500 });
  }
}
