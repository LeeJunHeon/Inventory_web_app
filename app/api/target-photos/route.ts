import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getSessionUserId, logActivity } from "@/lib/auth-helpers";
import {
  ALLOWED_EXT, MAX_UPLOAD_BYTES, MAX_PHOTOS_PER_LOG,
  isAllowedExt, normalizeFileName, processImage, decodeErrorMessage,
} from "@/lib/targetPhoto";

/**
 * 타겟 측정 사진 목록/업로드.
 *
 * ⚠️ 이 라우트는 어떤 경우에도 file_data / thumb_data 를 select 하지 않는다.
 *    이미지 본문은 /api/target-photos/[id] 로만 나간다 (응답 폭증 방지).
 */

// ⚠️ select 객체는 각 호출부에 인라인으로 둔다. 상수로 빼서 공유하면 Prisma가
//    리터럴 추론에 실패해 결과 타입이 무너진다(실제로 [id] 라우트에서 겪음).

// GET /api/target-photos?targetLogId= | targetUnitId= | material= & inch= & from= & to= & tag= & page= & limit=
export async function GET(request: NextRequest) {
  const authed = await getSessionUser();
  if ("error" in authed) {
    return NextResponse.json({ error: authed.error }, { status: authed.status });
  }
  try {
    const sp = request.nextUrl.searchParams;
    const targetLogId  = sp.get("targetLogId");
    const targetUnitId = sp.get("targetUnitId");
    const material     = sp.get("material");
    const inch         = sp.get("inch");
    const tag          = sp.get("tag");
    const from         = sp.get("from");
    const to           = sp.get("to");
    const matchStatus  = sp.get("matchStatus");
    const page  = Math.max(1, parseInt(sp.get("page")  || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") || "60", 10)));

    // 기존 코드(app/api/targets/route.ts)와 동일 패턴. Prisma WhereInput 에는
    // Record<string, unknown> 을 대입할 수 없다.
    const where: any = {};
    if (targetLogId)  where.targetLogId  = Number(targetLogId);
    if (targetUnitId) where.targetUnitId = Number(targetUnitId);
    if (material)     where.materialCode = { equals: material, mode: "insensitive" };
    if (inch)         where.diameterInch = Number(inch);
    if (tag)          where.tag          = tag;
    if (matchStatus)  where.matchStatus  = matchStatus;
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(from);
      if (to)   range.lte = new Date(to);
      where.takenDate = range;
    }

    const [total, photos] = await Promise.all([
      prisma.targetPhoto.count({ where }),
      prisma.targetPhoto.findMany({
        where,
        select: {
          id: true, targetLogId: true, targetUnitId: true,
          fileName: true, mimeType: true, fileSize: true, width: true, height: true,
          takenDate: true, materialCode: true, diameterInch: true, maker: true, tag: true,
          source: true, matchStatus: true, createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: [{ takenDate: "desc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      total, page, limit,
      photos: photos.map((p) => ({ ...p, uploaderName: p.user?.name ?? "", user: undefined })),
    });
  } catch (error) {
    console.error("GET /api/target-photos error:", error);
    return NextResponse.json({ error: "사진 조회 실패" }, { status: 500 });
  }
}

// POST /api/target-photos — multipart
//   경로 A: file, targetLogId, (tag)                  — 측정 기록에 붙인다
//   경로 B: file, targetUnitId, takenDate, (tag)      — 측정 기록 없이 타겟에만 붙인다
// 둘 다 오면 targetLogId 를 우선한다.
export async function POST(request: NextRequest) {
  const authed = await getSessionUser();
  if ("error" in authed) {
    return NextResponse.json({ error: authed.error }, { status: authed.status });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    const targetLogIdRaw  = form.get("targetLogId");
    const targetUnitIdRaw = form.get("targetUnitId");
    const takenDateRaw    = (form.get("takenDate") as string | null) || null;
    const tag = (form.get("tag") as string | null) || null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }
    const targetLogId  = Number(targetLogIdRaw);
    const targetUnitId = Number(targetUnitIdRaw);
    const hasLogId  = targetLogIdRaw  !== null && Number.isInteger(targetLogId);
    const hasUnitId = targetUnitIdRaw !== null && Number.isInteger(targetUnitId);
    if (!hasLogId && !hasUnitId) {
      return NextResponse.json(
        { error: "측정 기록 또는 타겟을 지정해야 합니다." },
        { status: 400 }
      );
    }
    const fileName = file.name || "photo.jpg";
    if (!isAllowedExt(fileName)) {
      return NextResponse.json(
        { error: `허용되지 않는 파일 형식입니다. (${ALLOWED_EXT.join(", ")})` },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `파일 크기는 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하여야 합니다.` },
        { status: 400 }
      );
    }

    const userId = await getSessionUserId();

    // ── 경로 B: 측정 기록 없이 타겟에만 붙인다 ──────────────────────────
    // ⚠️ 경로 A 와 합치지 않는다. select 리터럴을 공유하면 Prisma 추론이 무너진다.
    if (!hasLogId) {
      if (!takenDateRaw || !/^\d{4}-\d{2}-\d{2}$/.test(takenDateRaw)) {
        return NextResponse.json(
          { error: "촬영일을 YYYY-MM-DD 형식으로 지정해야 합니다." },
          { status: 400 }
        );
      }

      const unit = await prisma.targetUnit.findUnique({
        where: { id: targetUnitId },
        select: {
          id: true, category: true,
          item: { select: { targetSpec: { select: { materialCode: true, diameterInch: true } } } },
        },
      });
      if (!unit) {
        return NextResponse.json({ error: "타겟을 찾을 수 없습니다." }, { status: 404 });
      }
      if (unit.category !== "sputter") {
        return NextResponse.json(
          { error: "스퍼터 타겟에만 사진을 첨부할 수 있습니다." },
          { status: 400 }
        );
      }

      const existingB = await prisma.targetPhoto.count({
        where: { targetUnitId: unit.id, targetLogId: null },
      });
      if (existingB >= MAX_PHOTOS_PER_LOG) {
        return NextResponse.json(
          { error: "이 타겟에 측정 기록 없이 올린 사진이 이미 최대치입니다." },
          { status: 400 }
        );
      }

      const inputB = Buffer.from(await file.arrayBuffer());
      let imgB;
      try {
        imgB = await processImage(inputB);
      } catch (e) {
        console.error("processImage failed:", fileName, e);
        return NextResponse.json({ error: decodeErrorMessage(fileName) }, { status: 400 });
      }

      const specB = unit.item?.targetSpec ?? null;

      const createdB = await prisma.targetPhoto.create({
        data: {
          targetLogId:  null,
          targetUnitId: unit.id,
          fileName:     normalizeFileName(fileName),
          mimeType:     imgB.mimeType,
          fileData:     imgB.fileData,
          thumbData:    imgB.thumbData,
          fileSize:     imgB.fileSize,
          width:        imgB.width,
          height:       imgB.height,
          // ⚠️ UTC 자정. taken_date 는 @db.Date 라 로컬(KST) 자정으로 만들면 하루 밀린다.
          takenDate:    new Date(`${takenDateRaw}T00:00:00Z`),
          materialCode: specB?.materialCode ?? null,
          diameterInch: specB?.diameterInch ?? null,
          maker:        null,
          tag,
          source:       "upload",
          matchStatus:  "confirmed", // 어느 타겟인지는 확실하다
          uploadedBy:   userId,
        },
        select: {
          id: true, targetLogId: true, targetUnitId: true,
          fileName: true, mimeType: true, fileSize: true, width: true, height: true,
          takenDate: true, materialCode: true, diameterInch: true, maker: true, tag: true,
          source: true, matchStatus: true, createdAt: true,
          user: { select: { name: true } },
        },
      });

      await logActivity(userId, "CREATE", "target_photo", createdB.id,
        `타겟 #${unit.id} 사진 첨부 (${createdB.fileName})`);

      return NextResponse.json(
        { ...createdB, uploaderName: createdB.user?.name ?? "", user: undefined },
        { status: 201 }
      );
    }

    // ── 경로 A (기존) ────────────────────────────────────────────────────
    // 측정 기록 확인 + 메타 도출. 사진은 입고가 아니라 측정에 붙는다.
    const log = await prisma.targetLog.findUnique({
      where: { id: targetLogId },
      select: {
        id: true, loggedAt: true, targetUnitId: true,
        targetUnit: {
          select: {
            category: true,
            item: { select: { targetSpec: { select: { materialCode: true, diameterInch: true } } } },
          },
        },
      },
    });
    if (!log) {
      return NextResponse.json({ error: "측정 기록을 찾을 수 없습니다." }, { status: 404 });
    }
    if (log.targetUnit?.category !== "sputter") {
      return NextResponse.json(
        { error: "스퍼터 타겟 측정 기록에만 사진을 첨부할 수 있습니다." },
        { status: 400 }
      );
    }

    const existing = await prisma.targetPhoto.count({ where: { targetLogId } });
    if (existing >= MAX_PHOTOS_PER_LOG) {
      return NextResponse.json(
        { error: `사진은 측정 기록당 최대 ${MAX_PHOTOS_PER_LOG}장까지 첨부할 수 있습니다.` },
        { status: 400 }
      );
    }

    const input = Buffer.from(await file.arrayBuffer());
    let img;
    try {
      img = await processImage(input);
    } catch (e) {
      console.error("processImage failed:", fileName, e);
      return NextResponse.json({ error: decodeErrorMessage(fileName) }, { status: 400 });
    }

    const spec = log.targetUnit?.item?.targetSpec ?? null;

    const created = await prisma.targetPhoto.create({
      data: {
        targetLogId:  log.id,
        targetUnitId: log.targetUnitId,
        fileName:     normalizeFileName(fileName),
        mimeType:     img.mimeType,
        fileData:     img.fileData,
        thumbData:    img.thumbData,
        fileSize:     img.fileSize,
        width:        img.width,
        height:       img.height,
        // 촬영일은 측정 시각의 날짜 부분. logged_at 은 KST 벽시계로 저장돼 있다.
        takenDate:    new Date(log.loggedAt.toISOString().slice(0, 10)),
        materialCode: spec?.materialCode ?? null,
        diameterInch: spec?.diameterInch ?? null,
        maker:        null, // 제조사는 DB에 필드가 없다 (레거시 파일명에만 존재)
        tag,
        source:       "upload",
        matchStatus:  "confirmed",
        uploadedBy:   userId,
      },
      select: {
        id: true, targetLogId: true, targetUnitId: true,
        fileName: true, mimeType: true, fileSize: true, width: true, height: true,
        takenDate: true, materialCode: true, diameterInch: true, maker: true, tag: true,
        source: true, matchStatus: true, createdAt: true,
        user: { select: { name: true } },
      },
    });

    await logActivity(userId, "CREATE", "target_photo", created.id,
      `측정기록 #${log.id} 사진 첨부 (${created.fileName})`);

    return NextResponse.json(
      { ...created, uploaderName: created.user?.name ?? "", user: undefined },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/target-photos error:", error);
    return NextResponse.json({ error: "사진 업로드 실패" }, { status: 500 });
  }
}
