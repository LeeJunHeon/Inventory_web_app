import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seed 시작...");

  // ── 1. 품목 카테고리 ──────────────────────────
  await prisma.itemCategory.createMany({
    data: [
      { name: "웨이퍼" },
      { name: "타겟" },
      { name: "가스" },
      { name: "기자재/소모품" },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ 품목 카테고리");

  // ── 2. 위치 ───────────────────────────────────
  await prisma.location.createMany({
    data: [
      { name: "본사" },
      { name: "공덕" },
      { name: "실험실" },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ 위치");

  // ── 3. 거래 목적 ──────────────────────────────
  await prisma.txReason.createMany({
    data: [
      { name: "연구개발" },
      { name: "교육홍보" },
      { name: "제품판매" },
      { name: "최종생산" },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ 거래 목적");

  // ── 4. 거래처 ─────────────────────────────────
  await prisma.partner.createMany({
    data: [
      { name: "(주)실리콘밸리", partnerType: "VENDOR" },
      { name: "(주)메탈소스",   partnerType: "VENDOR" },
      { name: "에어코리아",     partnerType: "VENDOR" },
      { name: "삼성전자",       partnerType: "CUSTOMER" },
      { name: "LG이노텍",       partnerType: "CUSTOMER" },
      { name: "생산 1팀",       partnerType: "INTERNAL" },
      { name: "생산 2팀",       partnerType: "INTERNAL" },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ 거래처");

  // ── 5. 샘플 품목 ──────────────────────────────
  const wafer  = await prisma.itemCategory.findUnique({ where: { name: "웨이퍼" } });
  const target = await prisma.itemCategory.findUnique({ where: { name: "타겟" } });
  const gas    = await prisma.itemCategory.findUnique({ where: { name: "가스" } });
  const etc    = await prisma.itemCategory.findUnique({ where: { name: "기자재/소모품" } });

  if (wafer && target && gas && etc) {
    await prisma.item.createMany({
      data: [
        { categoryId: wafer.id,  code: "W4P0BT-89", name: '4" P-type Boron 웨이퍼', unit: "장" },
        { categoryId: wafer.id,  code: "W6P0SB-45", name: '6" P-type Sb 웨이퍼',    unit: "장" },
        { categoryId: target.id, code: "T-AU-3N",   name: "Au Target 3N 2인치",      unit: "개" },
        { categoryId: target.id, code: "T-TI-4N",   name: "Ti Target 4N 3인치",      unit: "개" },
        { categoryId: gas.id,    code: "G-AR-HP",   name: "Ar 고순도 가스 (99.999%)", unit: "병" },
        { categoryId: gas.id,    code: "G-N2-UHP",  name: "N₂ 초고순도 가스",         unit: "병" },
        { categoryId: etc.id,    code: "E-GLV-CR",  name: "클린룸 장갑 (M)",          unit: "개" },
        { categoryId: etc.id,    code: "E-WPR-A4",  name: "클린룸 와이퍼 A4",         unit: "장" },
      ],
      skipDuplicates: true,
    });
    console.log("  ✓ 샘플 품목");
  }

  console.log("✅ Seed 완료!");
}

main()
  .catch(e => { console.error("❌ Seed 실패:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());