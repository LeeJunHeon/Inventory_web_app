export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: "usd_krw_rate" } });
    if (setting) {
      return NextResponse.json({ rate: Number(setting.value), updatedAt: setting.updatedAt });
    }
    return NextResponse.json({ rate: 1400, updatedAt: null });
  } catch {
    return NextResponse.json({ rate: 1400, updatedAt: null });
  }
}
