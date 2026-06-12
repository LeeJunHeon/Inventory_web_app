import { NextResponse } from "next/server";
import { requireInternalAuth } from "@/lib/internal-auth";
import { OPERATION_SCHEMAS } from "@/lib/operation-schemas";

export const dynamic = "force-dynamic";

// GET /api/internal/schemas — 챗봇 작업 스키마 목록 반환
export async function GET(request: Request) {
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(OPERATION_SCHEMAS);
}
