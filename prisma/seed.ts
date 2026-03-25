import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seed 시작...");

  // ── 1. 품목 카테고리 ──────────────────────────
  const categories = [
    { id: 1, name: "타겟" },
    { id: 2, name: "웨이퍼" },
    { id: 3, name: "가스" },
    { id: 4, name: "기자재/소모품" },
  ];
  for (const c of categories) {
    await prisma.itemCategory.upsert({
      where:  { id: c.id },
      update: { name: c.name },
      create: { id: c.id, name: c.name },
    });
  }
  console.log("  ✓ 품목 카테고리");

  // ── 2. 위치 ───────────────────────────────────
  const locations = [
    { id: 1,  name: "본사" },
    { id: 2,  name: "공덕" },
    { id: 3,  name: "Vault" },
    { id: 4,  name: "Desicator 1" },
    { id: 5,  name: "Sputter 1 - Chamber 1 - Gun 1" },
    { id: 6,  name: "Sputter 1 - Chamber 2 - Gun 1" },
    { id: 7,  name: "Sputter 1 - Chamber 2 - Gun 2" },
    { id: 8,  name: "Sputter 1 - Chamber 2 - Gun 3" },
    { id: 9,  name: "Sputter 2 - Chamber K - Gun 1" },
    { id: 10, name: "Sputter 2 - Chamber K - Gun 2" },
  ];
  for (const l of locations) {
    await prisma.location.upsert({
      where:  { id: l.id },
      update: { name: l.name },
      create: { id: l.id, name: l.name },
    });
  }
  console.log("  ✓ 위치");

  // ── 3. 거래 목적 ──────────────────────────────
  const reasons = [
    { id: 1, name: "제품판매" },
    { id: 2, name: "연구개발" },
    { id: 3, name: "교육홍보" },
    { id: 4, name: "최종생산" },
  ];
  for (const r of reasons) {
    await prisma.txReason.upsert({
      where:  { id: r.id },
      update: { name: r.name },
      create: { id: r.id, name: r.name },
    });
  }
  console.log("  ✓ 거래 목적");

  // ── 4. 거래처 ─────────────────────────────────
  const partners: {
    id: number;
    name: string;
    managerName?: string | null;
    contact?: string | null;
  }[] = [
    { id: 106, name: "태원과학",            managerName: "박찬영",          contact: "sales@itasco.com" },
    { id: 107, name: "포사이언스",           managerName: "우청일",          contact: "031-8018-7279" },
    { id: 108, name: "남강하이테크",          managerName: "이완수",          contact: "wslee@namkang.co.kr" },
    { id: 109, name: "티에스플러스",          managerName: null,             contact: "tsp@tspluscorp.com" },
    { id: 110, name: "한일특수가스",          managerName: "길진아",          contact: "potar508@naver.com" },
    { id: 111, name: "AEM",                 managerName: "Alina Liu",       contact: "Alina@aemproduct.com" },
    { id: 112, name: "American Elements",   managerName: "Chad Lindner",    contact: "chad.lindner@americanelements.com" },
    { id: 113, name: "Hunan Boyu Tech.",    managerName: null,              contact: null },
    { id: 114, name: "KRT",                 managerName: null,              contact: null },
    { id: 115, name: "LTS",                 managerName: "Hirak Karmaker",  contact: "hkarmaker@ltschem.com" },
    { id: 116, name: "Quality Key Materials", managerName: "Janey Jia",    contact: "janey.jia@qukinsh.com" },
    { id: 117, name: "RND코리아",            managerName: null,              contact: null },
    { id: 118, name: "SCM",                 managerName: "Savy",            contact: "savy@scm-inc.com" },
    { id: 119, name: "Shanghai Famous Trd.", managerName: "Lia Wang",       contact: "lia@zmsh-materials.com" },
    { id: 120, name: "SMC Tech",            managerName: "윤현중",           contact: "ysmctech@naver.com" },
    { id: 121, name: "Toshima",             managerName: null,              contact: null },
    { id: 122, name: "Zhonggui",            managerName: "Lia",             contact: "daiyining00@gmail.com" },
    { id: 123, name: "최종생산",             managerName: null,              contact: null },
    { id: 142, name: "KIST",                managerName: null,              contact: null },
    { id: 162, name: "고려대",               managerName: null,              contact: null },
    { id: 183, name: "인하대학교",            managerName: "백인환 교수",      contact: null },
    { id: 214, name: "한양대",               managerName: "김상태 교수",      contact: null },
    { id: 250, name: "KETI",                managerName: "한승호 박사",       contact: null },
  ];

  for (const p of partners) {
    await prisma.partner.upsert({
      where:  { id: p.id },
      update: { name: p.name, managerName: p.managerName ?? null, contact: p.contact ?? null },
      create: { id: p.id, name: p.name, managerName: p.managerName ?? null, contact: p.contact ?? null },
    });
  }

  // Rayvac — ID 미지정, name으로 upsert
  await prisma.partner.upsert({
    where:  { name: "Rayvac" },
    update: { managerName: "민경대", contact: "mirror@rayvactech.com" },
    create: { name: "Rayvac", managerName: "민경대", contact: "mirror@rayvactech.com" },
  });

  console.log("  ✓ 거래처 (23개 + Rayvac)");

  console.log("✅ Seed 완료!");
}

main()
  .catch(e => { console.error("❌ Seed 실패:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
