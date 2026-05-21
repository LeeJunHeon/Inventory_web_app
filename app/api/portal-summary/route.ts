import { NextResponse } from "next/server";

// CORS 헤더 — 포털에서만 호출 허용
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://vanam.synology.me",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// GET /api/portal-summary
// 포털의 AppCardGrid 컴포넌트가 호출 — 재고관리 요약 정보 제공
// TODO: 추후 prisma로 실제 데이터 채우기
//   - totalItems: 전체 품목 수
//   - todayTxCount: 오늘 입출고 거래 건수
export async function GET() {
  return NextResponse.json(
    {
      totalItems: 0,
      todayTxCount: 0,
    },
    { headers: corsHeaders }
  );
}

// CORS preflight 요청 처리
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
