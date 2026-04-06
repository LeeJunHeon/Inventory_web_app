import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

// GET /api/barcodes — 바코드 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search     = searchParams.get("search")     || "";
    const category   = searchParams.get("category")   || "";
    const itemId     = searchParams.get("itemId");
    const activeOnly = searchParams.get("activeOnly");

    const where: any = {};
    if (itemId) {
      where.itemId = Number(itemId);
    }
    if (activeOnly === "true") {
      where.isActive = "Y";
    }
    if (category && category !== "전체") {
      where.OR = [
        { item: { category: { name: category } } },
        { targetUnit: { item: { category: { name: category } } } },
      ];
    }
    if (search) {
      // 검색어(스캔 조회)가 있을 때만 비활성 바코드 제외
      // BarcodePage 목록에서는 비활성도 보여야 하므로 search 없는 경우는 필터 미적용
      where.isActive = { not: "N" };
      const searchOR = [
        { code: { contains: search, mode: "insensitive" } },
        { item: { code: { contains: search, mode: "insensitive" } } },
        { item: { name: { contains: search, mode: "insensitive" } } },
        { targetUnit: { item: { code: { contains: search, mode: "insensitive" } } } },
        { targetUnit: { item: { name: { contains: search, mode: "insensitive" } } } },
      ];
      // category 필터와 search가 동시에 적용될 때 AND 조건으로 결합
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOR }];
        delete where.OR;
      } else {
        where.OR = searchOR;
      }
    }

    const barcodes = await prisma.barcode.findMany({
      where,
      include: {
        item: { include: { category: true } },
        targetUnit: { include: { item: { include: { category: true } } } },
      },
      orderBy: { id: "desc" },
    });

    return NextResponse.json(barcodes.map((b) => {
      // barcode.item 우선, 없으면 targetUnit.item에서 품목 정보 추출
      const item = b.item ?? b.targetUnit?.item ?? null;
      return {
        id:           b.id,
        code:         b.code,
        itemCode:     item?.code     || "",
        itemName:     item?.name     || "",
        category:     item?.category?.name || "",
        targetUnitId: b.targetUnit?.id ?? null,
        isActive:     b.isActive,
      };
    }));
  } catch (error) {
    console.error("GET /api/barcodes error:", error);
    return NextResponse.json({ error: "바코드 조회 실패" }, { status: 500 });
  }
}

// POST /api/barcodes — 바코드 생성
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const body = await request.json();
    const { itemId } = body;

    if (!itemId) {
      return NextResponse.json({ error: "itemId가 필요합니다." }, { status: 400 });
    }

    const item = await prisma.item.findUnique({
      where: { id: Number(itemId) },
      include: { category: true },
    });
    if (!item) {
      return NextResponse.json({ error: "품목을 찾을 수 없습니다." }, { status: 404 });
    }

    // BarcodeSeq를 이용한 순번 자동 생성
    const prefix = item.category.name.charAt(0).toUpperCase();
    const seq = await prisma.barcodeSeq.upsert({
      where:  { prefix },
      update: { lastNo: { increment: 1 } },
      create: { prefix, lastNo: 1 },
    });
    const newCode = `${prefix}-${String(seq.lastNo).padStart(4, "0")}`;

    // 타겟 품목인 경우 TargetUnit + Barcode를 트랜잭션으로 원자적 생성
    if (item.category.name === "타겟") {
      const result = await prisma.$transaction(async (tx) => {
        const targetUnit = await tx.targetUnit.create({
          data: {
            itemId: item.id,
            status: "available",
          },
        });

        const barcode = await tx.barcode.create({
          data: {
            code:         newCode,
            itemId:       item.id,
            targetUnitId: targetUnit.id,
            isActive:     "Y",
          },
          include: { item: { include: { category: true } }, targetUnit: true },
        });

        return barcode;
      });

      return NextResponse.json({
        id:       result.id,
        code:     result.code,
        itemCode: result.item?.code || "",
        itemName: result.item?.name || "",
        category: result.item?.category.name || "",
        targetId: result.targetUnit ? `TU-${String(result.targetUnit.id).padStart(3, "0")}` : "",
        isActive: result.isActive,
      }, { status: 201 });
    }

    // 타겟이 아닌 경우 바코드만 생성
    const barcode = await prisma.barcode.create({
      data: {
        code:         newCode,
        itemId:       item.id,
        targetUnitId: null,
        isActive:     "Y",
      },
      include: { item: { include: { category: true } }, targetUnit: true },
    });

    return NextResponse.json({
      id:       barcode.id,
      code:     barcode.code,
      itemCode: barcode.item?.code || "",
      itemName: barcode.item?.name || "",
      category: barcode.item?.category.name || "",
      targetId: "",
      isActive: barcode.isActive,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/barcodes error:", error);
    return NextResponse.json({ error: "바코드 생성 실패" }, { status: 500 });
  }
}

// DELETE /api/barcodes?id=1 — 바코드 삭제
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const barcode = await prisma.barcode.findUnique({ where: { id: Number(id) } });
    if (!barcode) return NextResponse.json({ error: "바코드를 찾을 수 없습니다." }, { status: 404 });

    // 연결된 재고 트랜잭션에서 참조 해제
    await prisma.inventoryTx.updateMany({
      where: { barcodeId: Number(id) },
      data:  { barcodeId: null },
    });
    await prisma.barcode.delete({ where: { id: Number(id) } });

    return NextResponse.json({ message: "바코드가 삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/barcodes error:", error);
    return NextResponse.json({ error: "바코드 삭제 실패" }, { status: 500 });
  }
}
