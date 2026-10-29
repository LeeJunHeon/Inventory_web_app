import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUserId, logActivity } from "@/lib/auth-helpers";
import { formatItemDetail, itemHeader } from "@/lib/logDetail";
import { WAFER_CATEGORY, pickWaferSpec, formatWaferSpecSummary, diffWaferSpec, hasOverwrite } from "@/lib/waferSpec";
import { validateWaferSpecInput, waferSpecSearchWhere } from "@/lib/waferSpecServer";
import type { WaferSpecData } from "@/lib/waferSpecServer";

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
        waferSpecSearchWhere(search, false),
      ];
    }

    const items = await prisma.item.findMany({
      where,
      include: { category: true, targetSpec: true, waferSpec: true },
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
      waferSpec:   pickWaferSpec(item.waferSpec),
      specSummary: item.category.name === WAFER_CATEGORY
        ? formatWaferSpecSummary(item.waferSpec, { labeled: false })
        : null,
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

    // 웨이퍼: 스펙(방향·직경 필수)을 먼저 검증 — 실패하면 아무것도 만들지 않는다
    const category = await prisma.itemCategory.findUnique({
      where: { id: Number(categoryId) }, select: { name: true },
    });
    let waferData: WaferSpecData | null = null;
    if (category?.name === WAFER_CATEGORY) {
      const v = validateWaferSpecInput(body.waferSpec, { itemCode: code.trim(), before: null });
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      waferData = v.data;
    }

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
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
      if (waferData) {
        await tx.waferSpec.create({ data: { itemId: created.id, ...waferData } });
      }
      return created;
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
    const specDetail = waferData ? formatWaferSpecSummary(waferData, { labeled: true }) : null;
    await logActivity(
      sessionUserId, "CREATE", "item", item.id,
      formatItemDetail(item) + (specDetail ? ` | 스펙: ${specDetail}` : "")
    );

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
      include: { category: true, waferSpec: true },
    });

    // 웨이퍼 스펙 — 검증과 "과거 기록 반영" 확인은 어떤 쓰기보다 먼저 한다
    const waferSpecBefore = pickWaferSpec(beforeItem?.waferSpec);
    let waferData: WaferSpecData | null = null;
    let specChanges: string[] = [];
    if (beforeItem?.category.name === WAFER_CATEGORY && body.waferSpec !== undefined) {
      const v = validateWaferSpecInput(body.waferSpec, { itemCode: beforeItem.code, before: waferSpecBefore });
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      specChanges = diffWaferSpec(waferSpecBefore, v.data);
      if (specChanges.length > 0) {
        waferData = v.data;
        // 비어 있던 칸을 처음 채우는 것만이면 확인 없이 저장 — 기존 값이 바뀌거나 비워질 때만 확인
        if (body.confirmSpecChange !== true && hasOverwrite(waferSpecBefore, v.data)) {
          const txCount = await prisma.inventoryTx.count({ where: { itemId: beforeItem.id } });
          if (txCount > 0) {
            return NextResponse.json({
              error: "스펙 변경 확인이 필요합니다.",
              needsConfirm: "specChange", txCount, changes: specChanges,
            }, { status: 409 });
          }
        }
      }
    }

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({
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
      if (waferData) {
        await tx.waferSpec.upsert({
          where:  { itemId: updated.id },
          update: waferData,
          create: { itemId: updated.id, ...waferData },
        });
      }
      return updated;
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
    if (waferData) ch.push(...specChanges);
    if (ch.length > 0 && beforeItem) {
      const sessionUserId = await getSessionUserId();
      await logActivity(
        sessionUserId, "UPDATE", "item", Number(id),
        `${itemHeader(beforeItem)} ${ch.join(" | ")}`,
        waferData ? { waferSpecBefore } : undefined
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
        include: { category: true, waferSpec: true },
      });
      if (before) {
        const specDetail = formatWaferSpecSummary(before.waferSpec, { labeled: true });
        deleteDetail = formatItemDetail(before) + (specDetail ? ` | 스펙: ${specDetail}` : "");
      }
    } catch { deleteDetail = undefined; }

    // DB FK 가 CASCADE 가 아니어도 안전하도록 스펙 행을 같은 트랜잭션에서 먼저 지운다
    await prisma.$transaction([
      prisma.waferSpec.deleteMany({ where: { itemId: Number(id) } }),
      prisma.item.delete({ where: { id: Number(id) } }),
    ]);

    const sessionUserId = await getSessionUserId();
    await logActivity(sessionUserId, "DELETE", "item", Number(id), deleteDetail);

    return NextResponse.json({ message: "품목이 삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/items error:", error);
    return NextResponse.json({ error: "품목 삭제 실패" }, { status: 500 });
  }
}
