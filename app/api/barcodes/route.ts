import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUserId, logActivity } from "@/lib/auth-helpers";

// GET /api/barcodes — 바코드 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search     = searchParams.get("search")     || "";
    const searchType = searchParams.get("searchType") || "전체";
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
      if (searchType === "바코드") {
        // Prisma 7 단일 OR 버그 우회: OR 배열 대신 where에 직접 조건 할당
        if (where.OR) {
          // 카테고리 필터가 동시에 있는 경우 AND로 결합
          where.AND = [
            { OR: where.OR },
            { code: { contains: search, mode: "insensitive" as const } },
          ];
          delete where.OR;
        } else {
          where.code = { contains: search, mode: "insensitive" as const };
        }
      } else {
        let searchOR;
        if (searchType === "품목코드") {
          searchOR = [
            { item: { code: { contains: search, mode: "insensitive" as const } } },
            { targetUnit: { item: { code: { contains: search, mode: "insensitive" as const } } } },
          ];
        } else if (searchType === "품목명") {
          searchOR = [
            { item: { name: { contains: search, mode: "insensitive" as const } } },
            { targetUnit: { item: { name: { contains: search, mode: "insensitive" as const } } } },
          ];
        } else {
          searchOR = [
            { code: { contains: search, mode: "insensitive" as const } },
            { item: { code: { contains: search, mode: "insensitive" as const } } },
            { item: { name: { contains: search, mode: "insensitive" as const } } },
            { targetUnit: { item: { code: { contains: search, mode: "insensitive" as const } } } },
            { targetUnit: { item: { name: { contains: search, mode: "insensitive" as const } } } },
          ];
        }
        // category 필터와 search가 동시에 적용될 때 AND 조건으로 결합
        if (where.OR) {
          where.AND = [{ OR: where.OR }, { OR: searchOR }];
          delete where.OR;
        } else {
          where.OR = searchOR;
        }
      }
    }

    const barcodes = await prisma.barcode.findMany({
      where,
      include: {
        item: { include: { category: true } },
        targetUnit: { include: { item: { include: { category: true } } } },
        inventoryTxs: {
          select: { txType: true, qty: true },
        },
      },
      orderBy: { code: "asc" },
    });

    return NextResponse.json(barcodes.map((b) => {
      // barcode.item 우선, 없으면 targetUnit.item에서 품목 정보 추출
      const item = b.item ?? b.targetUnit?.item ?? null;
      const inQty = b.inventoryTxs
        .filter(t => t.txType === "입고")
        .reduce((sum, t) => sum + t.qty, 0);
      const outQty = b.inventoryTxs
        .filter(t => t.txType === "출고" || t.txType === "불출")
        .reduce((sum, t) => sum + t.qty, 0);
      const remainQty = inQty - outQty;
      return {
        id:           b.id,
        code:         b.code,
        itemCode:     item?.code     || "",
        itemName:     item?.name     || "",
        category:     item?.category?.name || "",
        targetUnitId: b.targetUnit?.id ?? null,
        isActive:     b.isActive,
        memo:         b.memo ?? null,
        remainQty,
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
    const CATEGORY_PREFIX: Record<string, string> = { "타겟": "T", "웨이퍼": "W", "가스": "G", "기자재": "E" };
    const prefix = CATEGORY_PREFIX[item.category.name] ?? item.category.name.charAt(0).toUpperCase();
    const seq = await prisma.barcodeSeq.upsert({
      where:  { prefix },
      update: { lastNo: { increment: 1 } },
      create: { prefix, lastNo: 1 },
    });
    const newCode = `${prefix}-${seq.lastNo}`;

    // 타겟 품목인 경우 TargetUnit + Barcode를 트랜잭션으로 원자적 생성
    if (item.category.name === "타겟") {
      const result = await prisma.$transaction(async (tx) => {
        const targetUnit = await tx.targetUnit.create({
          data: {
            itemId: item.id,
            status: "미사용",
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

      const sessionUserId = await getSessionUserId();
      await logActivity(sessionUserId, "CREATE", "barcode", result.id);

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

    const sessionUserId = await getSessionUserId();
    await logActivity(sessionUserId, "CREATE", "barcode", barcode.id);

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
    return NextResponse.json({ error: "바코드 생성 실패", detail: String(error) }, { status: 500 });
  }
}

// PATCH /api/barcodes — 바코드 정보 수정
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

    const beforeBc = await prisma.barcode.findUnique({ where: { id: body.id } });

    const barcode = await prisma.barcode.update({
      where: { id: body.id },
      data: {
        ...(body.isActive    !== undefined ? { isActive:     body.isActive }    : {}),
        ...(body.code        !== undefined ? { code:         body.code }        : {}),
        ...(body.memo        !== undefined ? { memo: body.memo }                : {}),
      },
    });

    const ch: string[] = [];
    if (beforeBc) {
      if (body.code !== undefined && beforeBc.code !== body.code) ch.push(`코드: ${beforeBc.code} → ${body.code}`);
      if (body.isActive !== undefined && beforeBc.isActive !== body.isActive) ch.push(`활성: ${beforeBc.isActive} → ${body.isActive}`);
      if (body.memo !== undefined && (beforeBc.memo ?? "") !== (body.memo ?? "")) ch.push(`메모: ${beforeBc.memo || "-"} → ${body.memo || "-"}`);
    }
    const sessionUserId = await getSessionUserId();
    await logActivity(sessionUserId, "UPDATE", "barcode", barcode.id, ch.length > 0 ? ch.join(" | ") : undefined);

    return NextResponse.json(barcode);
  } catch (error) {
    console.error("PATCH /api/barcodes error:", error);
    return NextResponse.json({ error: "바코드 수정 실패" }, { status: 500 });
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

    const sessionUserId = await getSessionUserId();
    await logActivity(sessionUserId, "DELETE", "barcode", Number(id));

    return NextResponse.json({ message: "바코드가 삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/barcodes error:", error);
    return NextResponse.json({ error: "바코드 삭제 실패" }, { status: 500 });
  }
}
