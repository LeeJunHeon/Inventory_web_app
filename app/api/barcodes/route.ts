import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/barcodes — 바코드 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search   = searchParams.get("search")   || "";
    const category = searchParams.get("category") || "";

    const where: any = {};
    if (category && category !== "전체") {
      where.item = { category: { name: category } };
    }
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { item: { code: { contains: search, mode: "insensitive" } } },
        { item: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const barcodes = await prisma.barcode.findMany({
      where,
      include: { item: { include: { category: true } }, targetUnit: true },
      orderBy: { id: "desc" },
    });

    return NextResponse.json(barcodes.map((b) => ({
      id:       b.id,
      code:     b.code,
      itemCode: b.item?.code || "",
      itemName: b.item?.name || "",
      category: b.item?.category.name || "",
      targetId: b.targetUnit ? `TU-${String(b.targetUnit.id).padStart(3, "0")}` : "",
      isActive: b.isActive,
    })));
  } catch (error) {
    console.error("GET /api/barcodes error:", error);
    return NextResponse.json({ error: "바코드 조회 실패" }, { status: 500 });
  }
}

// POST /api/barcodes — 바코드 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, materialName, purity, hasCopper } = body;

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

    // 바코드 코드 자동 생성: 카테고리 접두어 + 4자리 순번
    const prefix = item.category.codePrefix || item.category.name.charAt(0).toUpperCase();
    const lastBarcode = await prisma.barcode.findFirst({
      where: { code: { startsWith: prefix + "-" } },
      orderBy: { id: "desc" },
    });
    let nextNum = 1;
    if (lastBarcode) {
      const parts = lastBarcode.code.split("-");
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    const newCode = `${prefix}-${String(nextNum).padStart(4, "0")}`;

    // 타겟 품목인 경우 TargetUnit 함께 생성
    let targetUnitId: number | null = null;
    if (item.category.name === "타겟") {
      const targetUnit = await prisma.targetUnit.create({
        data: {
          itemId: item.id,
          materialName: materialName || null,
          purity: purity || null,
          hasCopper: hasCopper || null,
          status: "available",
        },
      });
      targetUnitId = targetUnit.id;
    }

    const barcode = await prisma.barcode.create({
      data: {
        code: newCode,
        itemId: item.id,
        targetUnitId,
        isActive: true,
      },
      include: { item: { include: { category: true } }, targetUnit: true },
    });

    return NextResponse.json({
      id:       barcode.id,
      code:     barcode.code,
      itemCode: barcode.item?.code || "",
      itemName: barcode.item?.name || "",
      category: barcode.item?.category.name || "",
      targetId: barcode.targetUnit ? `TU-${String(barcode.targetUnit.id).padStart(3, "0")}` : "",
      isActive: barcode.isActive,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/barcodes error:", error);
    return NextResponse.json({ error: "바코드 생성 실패" }, { status: 500 });
  }
}

// DELETE /api/barcodes?id=1 — 바코드 삭제
export async function DELETE(request: NextRequest) {
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
