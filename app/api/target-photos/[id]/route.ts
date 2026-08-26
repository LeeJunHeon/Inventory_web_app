import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getSessionUserId, logActivity } from "@/lib/auth-helpers";

/**
 * 사진 본문 조회 / 삭제.
 *
 * 인증: /api/* 전체가 proxy.ts 에서 이미 세션 검사를 통과해야 도달한다.
 * 그래서 GET 에서는 별도 세션 조회를 하지 않는다 — 갤러리가 썸네일을 수십 개
 * 동시에 요청하므로 요청마다 DB 사용자 조회를 하면 그대로 비용이 된다.
 */

/** base64 이미지를 그대로 흘려보낸다. 내용이 바뀌지 않으므로 브라우저 캐시 허용. */
function imageResponse(base64: string, mimeType: string): NextResponse {
  const buffer = Buffer.from(base64, "base64");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
      // 공유 캐시(프록시)에는 저장하지 않도록 private
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// GET /api/target-photos/[id]?thumb=1
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "id가 올바르지 않습니다." }, { status: 400 });
    }
    const wantThumb = request.nextUrl.searchParams.get("thumb") === "1";

    // 두 경로를 완전히 분리한다. 하나의 변수에 담아 union 으로 두면
    // Prisma select 추론 + `in` 좁히기가 겹쳐 타입이 {} 로 무너진다(2회 겪음).
    if (wantThumb) {
      const p = await prisma.targetPhoto.findUnique({
        where: { id },
        select: { mimeType: true, thumbData: true, fileData: true },
      });
      if (!p) {
        return NextResponse.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
      }
      // 썸네일이 없는 행(구 데이터)이면 본문으로 폴백 — 화면이 깨지지 않게
      return imageResponse(p.thumbData ?? p.fileData, p.mimeType);
    }

    const p = await prisma.targetPhoto.findUnique({
      where: { id },
      select: { mimeType: true, fileData: true },
    });
    if (!p) {
      return NextResponse.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
    }
    return imageResponse(p.fileData, p.mimeType);
  } catch (error) {
    console.error("GET /api/target-photos/[id] error:", error);
    return NextResponse.json({ error: "사진 조회 실패" }, { status: 500 });
  }
}

// DELETE /api/target-photos/[id] — 업로더 본인 또는 admin
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await getSessionUser();
  if ("error" in authed) {
    return NextResponse.json({ error: authed.error }, { status: authed.status });
  }
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "id가 올바르지 않습니다." }, { status: 400 });
    }

    const photo = await prisma.targetPhoto.findUnique({
      where: { id },
      select: {
        id: true, fileName: true, uploadedBy: true,
        targetLogId: true, targetUnitId: true, source: true,
      },
    });
    if (!photo) {
      return NextResponse.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
    }

    const userId = await getSessionUserId();
    const isAdmin = authed.role === "admin";
    if (!isAdmin && photo.uploadedBy !== userId) {
      return NextResponse.json(
        { error: "본인이 올린 사진만 삭제할 수 있습니다." },
        { status: 403 }
      );
    }

    await prisma.targetPhoto.delete({ where: { id } });

    // 이미지 본문은 스냅샷에 넣지 않는다 (activity_log 가 비대해짐)
    await logActivity(userId, "DELETE", "target_photo", id,
      `사진 삭제 (${photo.fileName})`,
      { id: photo.id, fileName: photo.fileName, targetLogId: photo.targetLogId,
        targetUnitId: photo.targetUnitId, source: photo.source });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/target-photos/[id] error:", error);
    return NextResponse.json({ error: "사진 삭제 실패" }, { status: 500 });
  }
}
