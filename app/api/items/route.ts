import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUserId, logActivity } from "@/lib/auth-helpers";
import { formatItemDetail, itemHeader } from "@/lib/logDetail";

// 품목코드에서 타겟 스펙 파생 (파싱 실패 시 안전 기본값)
function parseTargetSpecFromCode(code: string) {
  const parts = code.split("-");
  const diaRaw = parseInt(parts[1], 10);
  const thkRaw = parts[3] ? Number(parts[3]) / 1000 : NaN;
  return {
    diameterInch: Number.isNaN(diaRaw) ? 0 : diaRaw,       // 사각/비표준 타겟 → 0
    materialCode: parts[2] || "UNKNOWN",
    thicknessInch: Number.isNaN(thkRaw) ? null : thkRaw,   // '3M' 등 파싱 불가 → null
  };
}

// GET /api/items
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "";
    const search   = searchParams.get("search")   || "";
    const showAll  = searchParams.get("showAll")  === "true";

    const where: any = {};

    if (!showAll) {
      where.isActive = true;
    }

    if (category && category !== "전체") {
      // ALD 조회 시 서브 카테고리(ALD Canister, ALD Precursor 등) 포함
      where.category = category === "ALD"
        ? {
            OR: [
              { name: "ALD" },
              { parent: { name: "ALD" } },
            ],
          }
        : { name: category };
    }
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.item.findMany({
      where,
      include: { category: true, targetSpec: true },
      orderBy: { code: "asc" },
    });

    return NextResponse.json(items.map((item) => ({
      id:          item.id,
      code:        item.code,
      name:        item.name,
      category:    item.category.name,
      categoryId:  item.categoryId,
      unit:        item.unit,
      minStockQty: item.minStockQty,
      note:        item.note,
      purity:          item.targetSpec?.purity != null ? Number(item.targetSpec.purity) : null,
      hasCopper:       item.targetSpec?.hasCopper ?? null,
      copperThickness: item.targetSpec?.copperThickness != null ? Number(item.targetSpec.copperThickness) : null,
      consumeAlertG:   item.targetSpec?.consumeAlertG != null ? Number(item.targetSpec.consumeAlertG) : null,
      isActive:    item.isActive,
    })));
  } catch (error) {
    console.error("GET /api/items error:", error);
    return NextResponse.json({ error: "품목 조회 실패" }, { status: 500 });
  }
}

// POST /api/items — 품목 등록
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const body = await request.json();
    const { code, name, categoryId, unit, minStockQty, note, purity, hasCopper, copperThickness, consumeAlertG } = body;

    if (!code?.trim() || !name?.trim() || !categoryId) {
      return NextResponse.json({ error: "품목코드, 품목명, 품목군은 필수입니다." }, { status: 400 });
    }

    const exists = await prisma.item.findUnique({ where: { code: code.trim() } });
    if (exists) {
      return NextResponse.json({ error: `품목코드 "${code}"가 이미 존재합니다.` }, { status: 409 });
    }

    const item = await prisma.item.create({
      data: {
        code:        code.trim(),
        name:        name.trim(),
        categoryId:  Number(categoryId),
        unit:        unit?.trim() || null,
        minStockQty: Number(minStockQty) || 0,
        note:        note?.trim() || null,
      },
      include: { category: true },
    });

    if (item.category.name === "타겟") {
      const { diameterInch, materialCode, thicknessInch } = parseTargetSpecFromCode(item.code);
      await prisma.targetSpec.create({
        data: {
          itemId: item.id, materialCode, diameterInch, thicknessInch,
          purity:          purity == null || purity === "" ? null : Number(purity),
          hasCopper:       hasCopper || null,
          copperThickness: copperThickness == null || copperThickness === "" ? null : Number(copperThickness),
          consumeAlertG:   consumeAlertG == null || consumeAlertG === "" ? null : Number(consumeAlertG),
        },
      });
    }

    const sessionUserId = await getSessionUserId();
    await logActivity(sessionUserId, "CREATE", "item", item.id, formatItemDetail(item));

    return NextResponse.json({
      id: item.id, code: item.code, name: item.name,
      category: item.category.name, categoryId: item.categoryId,
      unit: item.unit, minStockQty: item.minStockQty, note: item.note,
      isActive: item.isActive,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/items error:", error);
    return NextResponse.json({ error: "품목 등록 실패" }, { status: 500 });
  }
}

// PUT /api/items?id=1 — 품목 수정
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const body = await request.json();
    const { name, categoryId, unit, minStockQty, note, purity, hasCopper, copperThickness, consumeAlertG } = body;

    const beforeItem = await prisma.item.findUnique({
      where: { id: Number(id) },
      include: { category: true },
    });

    const item = await prisma.item.update({
      where: { id: Number(id) },
      data: {
        ...(name        !== undefined && { name:        name.trim() }),
        ...(categoryId  !== undefined && { categoryId:  Number(categoryId) }),
        ...(unit        !== undefined && { unit:        unit?.trim() || null }),
        ...(minStockQty !== undefined && { minStockQty: Number(minStockQty) }),
        ...(note        !== undefined && { note:        note?.trim() || null }),
      },
      include: { category: true },
    });

    if (item.category.name === "타겟" &&
        (purity !== undefined || hasCopper !== undefined || copperThickness !== undefined || consumeAlertG !== undefined)) {
      const { diameterInch, materialCode, thicknessInch } = parseTargetSpecFromCode(item.code);
      await prisma.targetSpec.upsert({
        where: { itemId: item.id },
        update: {
          ...(purity          !== undefined && { purity:          purity == null || purity === "" ? null : Number(purity) }),
          ...(hasCopper       !== undefined && { hasCopper:       hasCopper || null }),
          ...(copperThickness !== undefined && { copperThickness: copperThickness == null || copperThickness === "" ? null : Number(copperThickness) }),
          ...(consumeAlertG !== undefined && { consumeAlertG: consumeAlertG == null || consumeAlertG === "" ? null : Number(consumeAlertG) }),
        },
        create: {
          itemId: item.id, materialCode, diameterInch, thicknessInch,
          purity:          purity == null || purity === "" ? null : Number(purity),
          hasCopper:       hasCopper || null,
          copperThickness: copperThickness == null || copperThickness === "" ? null : Number(copperThickness),
          consumeAlertG:   consumeAlertG == null || consumeAlertG === "" ? null : Number(consumeAlertG),
        },
      });
    }

    const ch: string[] = [];
    if (beforeItem) {
      if (name !== undefined && beforeItem.name !== name) ch.push(`품목명: ${beforeItem.name} → ${name}`);
      if (unit !== undefined && (beforeItem.unit ?? "") !== (unit ?? "")) ch.push(`단위: ${beforeItem.unit || "-"} → ${unit || "-"}`);
      if (note !== undefined && (beforeItem.note ?? "") !== (note ?? "")) ch.push(`비고: ${beforeItem.note || "-"} → ${note || "-"}`);
    }
    if (ch.length > 0 && beforeItem) {
      const sessionUserId = await getSessionUserId();
      await logActivity(
        sessionUserId, "UPDATE", "item", Number(id),
        `${itemHeader(beforeItem)} ${ch.join(" | ")}`
      );
    }

    return NextResponse.json({
      id: item.id, code: item.code, name: item.name,
      category: item.category.name, categoryId: item.categoryId,
      unit: item.unit, minStockQty: item.minStockQty, note: item.note,
      isActive: item.isActive,
    });
  } catch (error) {
    console.error("PUT /api/items error:", error);
    return NextResponse.json({ error: "품목 수정 실패" }, { status: 500 });
  }
}

// DELETE /api/items?id=1 — 품목 삭제
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

    const txCount = await prisma.inventoryTx.count({ where: { itemId: Number(id) } });
    if (txCount > 0) {
      return NextResponse.json({ error: "거래 내역이 있어 삭제할 수 없습니다." }, { status: 409 });
    }

    // 삭제 전 스냅샷 확보 (실패해도 로그 기록은 진행)
    let deleteDetail: string | undefined;
    try {
      const before = await prisma.item.findUnique({
        where: { id: Number(id) },
        include: { category: true },
      });
      if (before) deleteDetail = formatItemDetail(before);
    } catch { deleteDetail = undefined; }

    await prisma.item.delete({ where: { id: Number(id) } });

    const sessionUserId = await getSessionUserId();
    await logActivity(sessionUserId, "DELETE", "item", Number(id), deleteDetail);

    return NextResponse.json({ message: "품목이 삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/items error:", error);
    return NextResponse.json({ error: "품목 삭제 실패" }, { status: 500 });
  }
}
