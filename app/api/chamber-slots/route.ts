import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

// GET /api/chamber-slots — 슬롯 전체 조회 또는 타겟 검색 (q 파라미터 있을 때)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q    = searchParams.get("q")?.trim() ?? "";
  const type = searchParams.get("type") ?? "바코드";

  // q가 있으면 타겟 검색 모드
  if (q) {
    try {
      let where: any = {};
      if (type === "바코드") {
        where = {
          barcodes: {
            some: {
              code: { equals: q, mode: "insensitive" },
              isActive: "Y",
            },
          },
        };
      } else if (type === "품목코드") {
        where = { item: { code: { contains: q, mode: "insensitive" } } };
      } else if (type === "품목명") {
        where = { item: { name: { contains: q, mode: "insensitive" } } };
      }

      const targets = await prisma.targetUnit.findMany({
        where: { ...where, status: { not: "폐기" } },
        include: {
          item: { include: { targetSpec: true } },
          barcodes: { where: { isActive: "Y" }, take: 1 },
        },
        take: 20,
        orderBy: { id: "asc" },
      });

      return NextResponse.json(
        targets.map(tu => ({
          id:           tu.id,
          barcodeCode:  tu.barcodes[0]?.code                     ?? "",
          itemName:     tu.item?.name                            ?? "",
          itemCode:     tu.item?.code                            ?? "",
          materialCode: tu.item?.targetSpec?.materialCode        ?? "",
          status:       tu.status,
        }))
      );
    } catch (error) {
      console.error("GET /api/chamber-slots search error:", error);
      return NextResponse.json({ error: "검색 실패" }, { status: 500 });
    }
  }

  // q 없으면 슬롯 전체 조회
  try {
    const slots = await prisma.chamberSlot.findMany({
      include: {
        location: true,
        targetUnit: {
          include: {
            item: { include: { targetSpec: true } },
            barcodes: { take: 1 },
            targetLogs: {
              where: {
                logType: "측정",
                weight: { not: null },
              },
              orderBy: { loggedAt: "desc" },
              take: 1,
            },
          },
        },
        updatedBy: { select: { id: true, name: true } },
      },
      orderBy: { locationId: "asc" },
    });

    return NextResponse.json(
      slots.map(s => ({
        id: s.id,
        locationId: s.locationId,
        locationName: s.location.name,
        targetUnitId: s.targetUnitId ?? null,
        barcodeCode: s.targetUnit?.barcodes[0]?.code ?? null,
        itemName: s.targetUnit?.item?.name ?? null,
        itemCode: s.targetUnit?.item?.code ?? null,
        materialCode: s.targetUnit?.item?.targetSpec?.materialCode ?? null,
        latestWeight: s.targetUnit?.targetLogs[0]?.weight
          ? Number(s.targetUnit.targetLogs[0].weight)
          : null,
        latestLoggedAt: s.targetUnit?.targetLogs[0]?.loggedAt ?? null,
        loadedAt: s.loadedAt ?? null,
        updatedBy: s.updatedBy?.name ?? null,
        note: s.note ?? null,
      }))
    );
  } catch (error) {
    console.error("GET /api/chamber-slots error:", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// PUT /api/chamber-slots — 슬롯 수정 (타겟 교체/제거)
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    const body = await request.json();
    const { id, targetUnitId, note } = body;

    const beforeSlot = await prisma.chamberSlot.findUnique({
      where: { id: Number(id) },
      include: {
        targetUnit: { include: { barcodes: { take: 1 } } },
        location: true,
      },
    });

    const slot = await prisma.chamberSlot.update({
      where: { id: Number(id) },
      data: {
        targetUnitId: targetUnitId ?? null,
        loadedAt: targetUnitId ? new Date() : null,
        updatedById: user?.id ?? null,
        note: note ?? null,
      },
    });

    if (user?.id && beforeSlot) {
      const ch: string[] = [];

      if (beforeSlot.targetUnitId !== (targetUnitId ?? null)) {
        const beforeCode = beforeSlot.targetUnit?.barcodes[0]?.code ?? "비어있음";
        let afterCode = "비어있음";
        if (targetUnitId) {
          const newTarget = await prisma.targetUnit.findUnique({
            where: { id: Number(targetUnitId) },
            include: { barcodes: { take: 1 } },
          });
          afterCode = newTarget?.barcodes[0]?.code ?? String(targetUnitId);
        }
        ch.push(`타겟: ${beforeCode} → ${afterCode}`);
      }

      const beforeNote = beforeSlot.note ?? "";
      const afterNote = note ?? "";
      if (beforeNote !== afterNote) {
        ch.push(`메모: ${beforeNote || "-"} → ${afterNote || "-"}`);
      }

      if (ch.length > 0) {
        await prisma.activityLog.create({
          data: { userId: user.id, action: "UPDATE", tableName: "chamber_slot", recordId: Number(id), detail: ch.join(" | ") },
        });
      }
    }

    return NextResponse.json(slot);
  } catch (error) {
    console.error("PUT /api/chamber-slots error:", error);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}
