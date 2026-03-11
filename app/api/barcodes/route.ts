import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/barcodes — 바코드 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
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
      include: {
        item: { include: { category: true } },
        targetUnit: true,
      },
      orderBy: { id: "desc" },
    });

    return NextResponse.json(barcodes.map((b) => ({
      id: b.id,
      code: b.code,
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
