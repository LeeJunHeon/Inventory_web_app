import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

// Canister 신규 생성은 재고관리 신규입고 + /api/barcodes 경로로 일원화되어 있다.
// (입고 tx 없이 유닛만 만들던 POST 핸들러는 원장 누락 경로여서 제거)
