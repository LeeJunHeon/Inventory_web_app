import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUserId, logActivity } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// GET /api/ald
// ?barcode=C-001         → 바코드로 단일 Canister 조회
// ?search=TTIP&type=물질명 → 검색
// (params 없음)           → 전체 ALD Canister 목록
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode") || "";
    const search  = searchParams.get("search")  || "";
    const type    = searchParams.get("type")    || "바코드";

    // ── 바코드로 단일 조회 ──
    if (barcode) {
      const bc = await prisma.barcode.findFirst({
        where: {
          code: { equals: barcode, mode: "insensitive" },
          isActive: "Y",
          targetUnit: { category: "ald" },
        },
        include: {
          targetUnit: {
            include: {
              item: true,
              aldCanisterSpec: true,
            },
          },
        },
      });

      if (!bc || !bc.targetUnit) {
        return NextResponse.json({ error: "Canister를 찾을 수 없습니다." }, { status: 404 });
      }

      const tu   = bc.targetUnit;
      const spec = tu.aldCanisterSpec;

      return NextResponse.json({
        id:                 tu.id,
        barcodeCode:        bc.code,
        itemCode:           tu.item?.code || "",
        itemName:           tu.item?.name || "",
        materialName:       spec?.materialName || "",
        status:             tu.status,
        tareWeight:         spec ? Number(spec.tareWeight) : null,
        initialGrossWeight: spec?.initialGrossWeight ? Number(spec.initialGrossWeight) : null,
      });
    }

    // ── 검색 또는 전체 목록 ──
    const where: any = { category: "ald" };
    if (search) {
      if (type === "바코드") {
        where.barcodes = { some: { code: { contains: search, mode: "insensitive" }, isActive: "Y" } };
      } else if (type === "물질명") {
        where.aldCanisterSpec = { materialName: { contains: search, mode: "insensitive" } };
      }
    }

    const units = await prisma.targetUnit.findMany({
      where,
      include: {
        barcodes:        { where: { isActive: "Y" }, take: 1 },
        aldCanisterSpec: true,
        item:            true,
      },
      orderBy: { id: "desc" },
    });

    return NextResponse.json(units.map(tu => ({
      id:                 tu.id,
      barcodeCode:        tu.barcodes[0]?.code || "",
      itemCode:           tu.item?.code || "",
      itemName:           tu.item?.name || "",
      materialName:       tu.aldCanisterSpec?.materialName || "",
      status:             tu.status,
      tareWeight:         tu.aldCanisterSpec ? Number(tu.aldCanisterSpec.tareWeight) : null,
      initialGrossWeight: tu.aldCanisterSpec?.initialGrossWeight
                            ? Number(tu.aldCanisterSpec.initialGrossWeight) : null,
    })));
  } catch (error) {
    console.error("GET /api/ald error:", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// POST /api/ald
// Canister 신규 생성: target_unit + ald_canister_spec + barcode(C-xxx) 동시 생성
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const body = await request.json();
    const { materialName, tareWeight, initialGrossWeight, memo } = body;

    if (!tareWeight) {
      return NextResponse.json({ error: "Tare Weight는 필수입니다." }, { status: 400 });
    }

    // C prefix 바코드 순번 채번
    const seq = await prisma.barcodeSeq.upsert({
      where:  { prefix: "C" },
      update: { lastNo: { increment: 1 } },
      create: { prefix: "C", lastNo: 1 },
    });
    const newCode = `C-${seq.lastNo}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. target_unit 생성 (category = 'ald')
      const targetUnit = await tx.targetUnit.create({
        data: {
          itemId:   body.itemId ? Number(body.itemId) : null,
          status:   "미사용",
          category: "ald",
          note:     memo || null,
        },
      });

      // 2. ald_canister_spec 생성
      await tx.aldCanisterSpec.create({
        data: {
          targetUnitId:       targetUnit.id,
          tareWeight:         Number(tareWeight),
          materialName:       materialName || null,
          initialGrossWeight: initialGrossWeight ? Number(initialGrossWeight) : null,
        },
      });

      // 3. barcode 생성
      const barcode = await tx.barcode.create({
        data: {
          code:         newCode,
          targetUnitId: targetUnit.id,
          isActive:     "Y",
          memo:         memo || null,
        },
      });

      return { targetUnit, barcode };
    });

    const sessionUserId = await getSessionUserId();
    await logActivity(sessionUserId, "CREATE", "target_unit", result.targetUnit.id,
      `ALD Canister 생성: ${newCode} / 물질: ${materialName || "-"}`);

    return NextResponse.json({
      id:           result.targetUnit.id,
      barcodeCode:  newCode,
      materialName: materialName || "",
      status:       "미사용",
      tareWeight:   Number(tareWeight),
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/ald error:", error);
    return NextResponse.json({ error: "Canister 생성 실패", detail: String(error) }, { status: 500 });
  }
}
