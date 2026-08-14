import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, logActivity } from "@/lib/auth-helpers";
import { expandBarcodeVariants } from "@/lib/barcodeUtils";
import { buildTargetLogDetail } from "@/lib/logDetail";
import { createDisposalTxForTarget } from "@/lib/txTypes";
import { checkAndSendConsumeAlert } from "@/lib/targetConsumeAlert";

// GET /api/targets?barcode=T-0187&page=1&limit=50
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const barcode   = searchParams.get("barcode")   || "";
    const itemCode  = searchParams.get("itemCode")  || "";
    const itemName  = searchParams.get("itemName")  || "";
    const page    = Math.max(1, parseInt(searchParams.get("page")  || "1", 10));
    const limit   = Math.max(1, parseInt(searchParams.get("limit") || "50", 10));
    const skip    = (page - 1) * limit;

    // 품목코드 또는 품목명 검색: 해당 품목의 타겟 목록 반환
    if (itemCode || itemName) {
      const whereItem: any = {};
      if (itemCode) whereItem.code = { contains: itemCode, mode: "insensitive" };
      if (itemName) whereItem.name = { contains: itemName, mode: "insensitive" };

      const targetUnits = await prisma.targetUnit.findMany({
        where: { category: "sputter", item: whereItem },
        include: {
          item: { include: { category: true, targetSpec: true } },
          barcodes: { take: 1 },
        },
        orderBy: { id: "asc" },
      });

      const targetList = targetUnits.map(tu => ({
        id:           tu.id,
        barcodeCode:  tu.barcodes[0]?.code              || "",
        itemCode:     tu.item?.code                     || "",
        itemName:     tu.item?.name                     || "",
        materialName: tu.item?.targetSpec?.materialCode || "",
        status:       tu.status,
      }));

      return NextResponse.json({ targetList });
    }

    // 바코드 지정 시: 해당 타겟 정보 + 로그 (페이지네이션 적용)
    if (barcode) {
      const variants = expandBarcodeVariants(barcode);
      const bc = await prisma.barcode.findFirst({
        where: {
          OR: variants.map(v => ({ code: { equals: v, mode: "insensitive" as const } })),
        },
        include: {
          item: { include: { category: true, targetSpec: true } },
          targetUnit: {
            include: {
              item: { include: { category: true, targetSpec: true } },
            },
          },
        },
      });

      if (!bc || !bc.targetUnit) {
        return NextResponse.json({ error: "타겟을 찾을 수 없습니다" }, { status: 404 });
      }

      const where = { targetUnitId: bc.targetUnit.id };
      const measureWhere = { targetUnitId: bc.targetUnit.id, logType: "측정", weight: { not: null } };
      const [total, logs, firstMeasure, lastMeasure] = await Promise.all([
        prisma.targetLog.count({ where }),
        prisma.targetLog.findMany({
          where,
          include: { location: true, user: true },
          orderBy: { loggedAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.targetLog.findFirst({
          where: measureWhere,
          orderBy: [{ loggedAt: "asc" }, { id: "asc" }],
          select: { weight: true },
        }),
        prisma.targetLog.findFirst({
          where: measureWhere,
          orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
          select: { weight: true },
        }),
      ]);

      // 바코드에 item이 직접 연결되지 않은 경우 targetUnit.item으로 fallback
      const bcItem = bc.item ?? bc.targetUnit?.item ?? null;

      // 소진 알림 진행 표시용
      const firstWeight   = firstMeasure?.weight != null ? Number(firstMeasure.weight) : null;
      const currentWeight = lastMeasure?.weight  != null ? Number(lastMeasure.weight)  : null;
      // 과거 데이터에 무게 역전 건이 있어 음수가 나올 수 있다 → 0으로 클램프
      const consumedG =
        firstWeight != null && currentWeight != null
          ? Math.max(0, firstWeight - currentWeight)
          : null;
      const consumeAlertG =
        bcItem?.targetSpec?.consumeAlertG != null ? Number(bcItem.targetSpec.consumeAlertG) : null;

      return NextResponse.json({
        total, page, limit,
        target: {
          id:           bc.targetUnit.id,
          barcodeCode:  bc.code,
          itemCode:     bcItem?.code                      || "",
          itemName:     bcItem?.name                      || "",
          materialName: bcItem?.targetSpec?.materialCode  || "",
          status:       bc.targetUnit.status,
          note:         bc.targetUnit.note                || "",
          consumeAlertG,
          firstWeight,
          currentWeight,
          consumedG,
        },
        logs: logs.map((l) => ({
          id: l.id,
          targetId: l.targetUnitId,
          timestamp: l.loggedAt.toISOString().replace("T", " ").slice(0, 16),
          type: l.logType,
          weight: l.weight ? Number(l.weight) : null,
          location: l.location?.name || "",
          locationId: l.locationId ?? null,
          reason: l.reason || "",
          userName: l.user?.name || "",
          barcodeCode: bc.code,
          itemName: bcItem?.name || "",
        })),
      });
    }

    // 바코드 미지정: 전체 타겟 로그 (페이지네이션 적용)
    // target_log는 sputter/ald가 공유하는 테이블이므로 분류로 좁힌다.
    // (count와 findMany에 동일한 where를 써야 총건수와 페이지가 어긋나지 않는다)
    const logWhere = { targetUnit: { category: "sputter" } };
    const [total, logs] = await Promise.all([
      prisma.targetLog.count({ where: logWhere }),
      prisma.targetLog.findMany({
        where: logWhere,
        orderBy: { loggedAt: "desc" },
        skip,
        take: limit,
        include: {
          location: true,
          user: true,
          targetUnit: {
            include: {
              barcodes: { take: 1 },
              item: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      total, page, limit,
      target: null,
      logs: logs.map((l) => ({
        id: l.id,
        targetId: l.targetUnitId,
        timestamp: l.loggedAt.toISOString().replace("T", " ").slice(0, 16),
        type: l.logType,
        weight: l.weight ? Number(l.weight) : null,
        location: l.location?.name || "",
        locationId: l.locationId ?? null,
        reason: l.reason || "",
        userName: l.user?.name || "",
        barcodeCode: l.targetUnit.barcodes[0]?.code || "",
        itemName: l.targetUnit.item?.name || "",
      })),
    });
  } catch (error) {
    console.error("GET /api/targets error:", error);
    return NextResponse.json({ error: "타겟 조회 실패" }, { status: 500 });
  }
}

// POST /api/targets — 측정값 저장
export async function POST(request: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId();

    const body = await request.json();

    const logType     = body.logType || body.type || "측정";
    const isDispose   = logType === "폐기";
    const isMeasure   = logType === "측정";

    if (isMeasure) {
      const STORAGE_IDS = [3, 4];
      const CHAMBER_IDS = [5, 6, 7, 8, 9, 10];

      // 직전 로그의 locationId 조회
      const lastLocLog = await prisma.targetLog.findFirst({
        where: { targetUnitId: body.targetUnitId },
        orderBy: { loggedAt: "desc" },
        select: { locationId: true },
      });

      const prevLocationId = lastLocLog?.locationId ?? null;
      const currLocationId = body.locationId ? Number(body.locationId) : null;

      const isStorageToChamber =
        prevLocationId !== null &&
        currLocationId !== null &&
        STORAGE_IDS.includes(prevLocationId) &&
        CHAMBER_IDS.includes(currLocationId);

      const weightRequired = !isStorageToChamber;

      if (weightRequired && body.weight == null) {
        return NextResponse.json(
          { error: "무게를 입력해주세요." },
          { status: 400 }
        );
      }
    }

    // 무게 측정 시: 이전 측정값보다 높으면 저장 차단
    if (isMeasure && body.weight != null) {
      const newWeight = Number(body.weight);
      const lastLog = await prisma.targetLog.findFirst({
        where: {
          targetUnitId: body.targetUnitId,
          logType: "측정",
          weight: { not: null },
        },
        orderBy: { loggedAt: "desc" },
        select: { weight: true },
      });
      if (lastLog?.weight != null) {
        const prevWeight = Number(lastLog.weight);
        if (newWeight > prevWeight) {
          return NextResponse.json(
            { error: `입력한 무게(${newWeight.toFixed(3)}g)가 이전 측정값(${prevWeight.toFixed(3)}g)보다 높습니다. 다시 확인해주세요.` },
            { status: 400 }
          );
        }
      }
    }

    const log = await prisma.targetLog.create({
      data: {
        targetUnitId: body.targetUnitId,
        logType,
        weight:       body.weight     ?? null,
        locationId:   body.locationId || null,
        reason:       body.reason     || null,
        userId:       sessionUserId ?? null,
      },
    });

    // 위치 구분 상수 — 전이 게이트와 아래 chamber_slot 블록이 공유
    const STORAGE_IDS_SLOT = [3, 4];
    const CHAMBER_IDS_SLOT = [5, 6, 7, 8, 9, 10];

    // 미사용 → 사용중 자동 상태 전이 + inventory_tx 자동 기록
    // 챔버로 장착하는 측정일 때만 전이한다. 도착 검수용 계측(보관함/위치 미선택)은
    // target_log만 남기고 상태·재고를 건드리지 않는다(판매 예정 신품 보호).
    if (isMeasure) {
      const measureLocId = body.locationId ? Number(body.locationId) : null;
      const isChamberMeasure = measureLocId !== null && CHAMBER_IDS_SLOT.includes(measureLocId);
      const tu = await prisma.targetUnit.findUnique({
        where: { id: body.targetUnitId },
        select: { status: true, itemId: true, category: true },
      });
      if (tu && tu.category !== "sputter") {
        return NextResponse.json(
          { error: "ALD Canister는 타겟 사용현황 API를 사용할 수 없습니다." },
          { status: 400 }
        );
      }
      if (tu?.status === "미사용" && isChamberMeasure) {
        await prisma.$transaction(async (tx) => {
          await tx.targetUnit.update({
            where: { id: body.targetUnitId },
            data: { status: "사용중" },
          });
          const bc = await tx.barcode.findFirst({
            where: { targetUnitId: body.targetUnitId, isActive: "Y" },
            select: { id: true },
          });
          // 이 바코드의 입고 전표를 참조로 걸어 로트 잔여를 소진시킨다 (장착 타겟 오출고 차단)
          const inboundTx = bc
            ? await tx.inventoryTx.findFirst({
                where: { barcodeId: bc.id, txType: "입고" },
                select: { txNo: true, locationId: true },
              })
            : null;
          const allTxNos = await tx.inventoryTx.findMany({
            where: { txNo: { not: null } },
            select: { txNo: true },
          });
          const lastNo = allTxNos.reduce((max, t) => {
            const n = Number(t.txNo);
            return !isNaN(n) && n > max ? n : max;
          }, 0);
          const newTxNo = String(lastNo + 1);
          await tx.inventoryTx.create({
            data: {
              txNo: newTxNo,
              txType: "사용중",
              txDate: new Date(),
              itemId: tu.itemId!,
              targetUnitId: body.targetUnitId,
              barcodeId: bc?.id ?? null,
              // 재고 원장은 재고가 있던 위치에서 차감돼야 본사/공덕 분리 집계가 맞는다.
              // (측정 위치는 target_log·chamber_slot이 이미 기록)
              locationId: inboundTx?.locationId ?? 1,
              qty: 1,
              userId: sessionUserId,
              refTxNo: inboundTx?.txNo ?? null,
              memo: "타겟 사용 시작 - 자동 기록",
            },
          });
        });
      }
    }

    // chamber_slot 자동 업데이트 + 이력 기록 (상수는 위 전이 블록과 공유)
    const newLocationId = body.locationId ? Number(body.locationId) : null;

    if (newLocationId && CHAMBER_IDS_SLOT.includes(newLocationId)) {
      // 챔버로 이동 → 기존 타겟 조회 → 변경된 경우만 업데이트 + 로그 기록
      const existingSlot = await prisma.chamberSlot.findFirst({
        where: { locationId: newLocationId },
        select: { targetUnitId: true },
      });
      const previousTargetUnitId = existingSlot?.targetUnitId ?? null;

      if (previousTargetUnitId !== body.targetUnitId) {
        await prisma.chamberSlot.updateMany({
          where: { locationId: newLocationId },
          data: {
            targetUnitId: body.targetUnitId,
            loadedAt: new Date(),
          },
        });
        await prisma.chamberSlotLog.create({
          data: {
            locationId: newLocationId,
            targetUnitId: body.targetUnitId,
            previousTargetUnitId,
            action: previousTargetUnitId == null ? "load" : "swap",
            changedById: sessionUserId ?? null,
            note: "측정 저장으로 자동 변경",
          },
        });
      }
    } else if (newLocationId && STORAGE_IDS_SLOT.includes(newLocationId)) {
      // 보관함으로 이동 → 해당 타겟이 있던 챔버 슬롯 비우기 + 로그 기록
      const slotsToUnload = await prisma.chamberSlot.findMany({
        where: { targetUnitId: body.targetUnitId },
        select: { locationId: true },
      });

      if (slotsToUnload.length > 0) {
        await prisma.chamberSlot.updateMany({
          where: { targetUnitId: body.targetUnitId },
          data: {
            targetUnitId: null,
            loadedAt: null,
          },
        });
        for (const s of slotsToUnload) {
          await prisma.chamberSlotLog.create({
            data: {
              locationId: s.locationId,
              targetUnitId: null,
              previousTargetUnitId: body.targetUnitId,
              action: "unload",
              changedById: sessionUserId ?? null,
              note: "보관함 이동으로 자동 비움",
            },
          });
        }
      }
    }

    // 폐기 처리인 경우 타겟 상태 변경 + 바코드 비활성화 + 챔버 슬롯 자동 비움
    if (isDispose) {
      await prisma.targetUnit.update({
        where: { id: body.targetUnitId },
        data: { status: "폐기", disposedAt: new Date() },
      });
      await prisma.barcode.updateMany({
        where: { targetUnitId: body.targetUnitId },
        data: { isActive: "N" },
      });

      // 폐기 타겟이 챔버에 있었다면 비우고 unload 로그 기록
      const disposedSlots = await prisma.chamberSlot.findMany({
        where: { targetUnitId: body.targetUnitId },
        select: { locationId: true },
      });
      if (disposedSlots.length > 0) {
        await prisma.chamberSlot.updateMany({
          where: { targetUnitId: body.targetUnitId },
          data: {
            targetUnitId: null,
            loadedAt: null,
          },
        });
        for (const s of disposedSlots) {
          await prisma.chamberSlotLog.create({
            data: {
              locationId: s.locationId,
              targetUnitId: null,
              previousTargetUnitId: body.targetUnitId,
              action: "unload",
              changedById: sessionUserId ?? null,
              note: "폐기 처리로 자동 비움",
            },
          });
        }
      }

      // 재고 원장에도 폐기 tx 자동 기록 (이미 있으면 스킵)
      await createDisposalTxForTarget({
        targetUnitId: body.targetUnitId,
        userId:       sessionUserId ?? null,
      });
    }

    // activity_log 기록 (등록 시점 내용을 detail에 스냅샷)
    const logUserId = sessionUserId ?? null;
    await logActivity(logUserId, "CREATE", "target_log", log.id, await buildTargetLogDetail(log.id));

    // 타겟 소진 알림 — 측정일 때만. 내부에서 예외를 전부 흡수하므로 저장에 영향 없음
    if (isMeasure) {
      await checkAndSendConsumeAlert(body.targetUnitId);
    }

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("POST /api/targets error:", error);
    return NextResponse.json({ error: "측정값 저장 실패" }, { status: 500 });
  }
}
