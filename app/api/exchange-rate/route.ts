export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: "usd_krw_rate" } });

    // 캐시 유효 여부 확인 (24시간 이내)
    const isFresh = setting && (Date.now() - new Date(setting.updatedAt).getTime() < 24 * 60 * 60 * 1000);

    if (isFresh) {
      return NextResponse.json({ rate: Number(setting.value), cached: true, updatedAt: setting.updatedAt });
    }

    // 외부 API 호출
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!res.ok) throw new Error("외부 API 응답 오류");
      const data = await res.json();
      const rate = Math.round(data.rates.KRW);

      await prisma.appSetting.upsert({
        where: { key: "usd_krw_rate" },
        update: { value: String(rate) },
        create: { key: "usd_krw_rate", value: String(rate), description: "USD→KRW 환율 (외부 API 캐싱값)" },
      });

      return NextResponse.json({ rate, cached: false, updatedAt: new Date() });
    } catch {
      // 외부 API 실패 — DB 기존값 반환
      if (setting) {
        return NextResponse.json({ rate: Number(setting.value), cached: true, updatedAt: setting.updatedAt });
      }
      return NextResponse.json({ rate: 1400, cached: false, updatedAt: null });
    }
  } catch {
    return NextResponse.json({ rate: 1400, cached: false, updatedAt: null });
  }
}
