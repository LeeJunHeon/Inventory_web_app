import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("시드 데이터 삽입 시작...");

  // 1. 사용자
  const admin = await prisma.user.upsert({
    where: { email: "admin@company.com" },
    update: {},
    create: {
      email: "admin@company.com",
      name: "김철수",
      role: "admin",
    },
  });

  const emp1 = await prisma.user.upsert({
    where: { email: "yhlee@company.com" },
    update: {},
    create: {
      email: "yhlee@company.com",
      name: "이영희",
      role: "admin",
    },
  });

  const emp2 = await prisma.user.upsert({
    where: { email: "mspark@company.com" },
    update: {},
    create: {
      email: "mspark@company.com",
      name: "박민수",
      role: "employee",
    },
  });

  const emp3 = await prisma.user.upsert({
    where: { email: "sjjung@company.com" },
    update: {},
    create: {
      email: "sjjung@company.com",
      name: "정수진",
      role: "employee",
    },
  });

  console.log("✅ 사용자 생성 완료");

  // 2. 품목 카테고리
  const catWafer = await prisma.itemCategory.upsert({
    where: { name: "웨이퍼" },
    update: {},
    create: { name: "웨이퍼", codePrefix: "W", sortOrder: 1 },
  });

  const catTarget = await prisma.itemCategory.upsert({
    where: { name: "타겟" },
    update: {},
    create: { name: "타겟", codePrefix: "T", sortOrder: 2 },
  });

  const catGas = await prisma.itemCategory.upsert({
    where: { name: "가스" },
    update: {},
    create: { name: "가스", codePrefix: "G", sortOrder: 3 },
  });

  const catEquip = await prisma.itemCategory.upsert({
    where: { name: "기자재/소모품" },
    update: {},
    create: { name: "기자재/소모품", codePrefix: "E", sortOrder: 4 },
  });

  console.log("✅ 카테고리 생성 완료");

  // 3. 품목
  const items = await Promise.all([
    prisma.item.upsert({
      where: { code: 'W4P0BT-89' },
      update: {},
      create: {
        categoryId: catWafer.id,
        code: 'W4P0BT-89',
        name: '4" P-type Boron 웨이퍼',
      },
    }),
    prisma.item.upsert({
      where: { code: 'W6P0SB-45' },
      update: {},
      create: {
        categoryId: catWafer.id,
        code: 'W6P0SB-45',
        name: '6" P-type Sb 웨이퍼',
      },
    }),
    prisma.item.upsert({
      where: { code: "T-AU-3N" },
      update: {},
      create: {
        categoryId: catTarget.id,
        code: "T-AU-3N",
        name: "Au Target 3N 2인치",
      },
    }),
    prisma.item.upsert({
      where: { code: "T-TI-4N" },
      update: {},
      create: {
        categoryId: catTarget.id,
        code: "T-TI-4N",
        name: "Ti Target 4N 3인치",
      },
    }),
    prisma.item.upsert({
      where: { code: "T-AL-4N" },
      update: {},
      create: {
        categoryId: catTarget.id,
        code: "T-AL-4N",
        name: "Al Target 4N 2인치",
      },
    }),
    prisma.item.upsert({
      where: { code: "G-AR-HP" },
      update: {},
      create: {
        categoryId: catGas.id,
        code: "G-AR-HP",
        name: "Ar 고순도 가스 (99.999%)",
      },
    }),
    prisma.item.upsert({
      where: { code: "G-N2-UHP" },
      update: {},
      create: {
        categoryId: catGas.id,
        code: "G-N2-UHP",
        name: "N₂ 초고순도 가스",
      },
    }),
    prisma.item.upsert({
      where: { code: "E-GLV-CR" },
      update: {},
      create: {
        categoryId: catEquip.id,
        code: "E-GLV-CR",
        name: "클린룸 장갑 (M)",
      },
    }),
    prisma.item.upsert({
      where: { code: "E-WPR-A4" },
      update: {},
      create: {
        categoryId: catEquip.id,
        code: "E-WPR-A4",
        name: "클린룸 와이퍼 A4",
      },
    }),
  ]);

  console.log("✅ 품목 생성 완료");

  // 4. 거래처
  const partners = await Promise.all([
    prisma.partner.upsert({
      where: { name: "(주)실리콘밸리" },
      update: {},
      create: { name: "(주)실리콘밸리", type: "vendor" },
    }),
    prisma.partner.upsert({
      where: { name: "삼성전자" },
      update: {},
      create: { name: "삼성전자", type: "vendor" },
    }),
    prisma.partner.upsert({
      where: { name: "에어코리아" },
      update: {},
      create: { name: "에어코리아", type: "vendor" },
    }),
    prisma.partner.upsert({
      where: { name: "(주)메탈소스" },
      update: {},
      create: { name: "(주)메탈소스", type: "vendor" },
    }),
    prisma.partner.upsert({
      where: { name: "LG이노텍" },
      update: {},
      create: { name: "LG이노텍", type: "vendor" },
    }),
    prisma.partner.upsert({
      where: { name: "생산 1팀" },
      update: {},
      create: { name: "생산 1팀", type: "disburse" },
    }),
    prisma.partner.upsert({
      where: { name: "생산 2팀" },
      update: {},
      create: { name: "생산 2팀", type: "disburse" },
    }),
  ]);

  console.log("✅ 거래처 생성 완료");

  // 5. 타겟 유닛
  const tu1 = await prisma.targetUnit.create({
    data: {
      itemId: items[2].id,
      materialName: 'Au 2" 0.125t',
      purity: "3N (99.9%)",
      hasCopper: "무",
      status: "using",
    },
  });

  const tu2 = await prisma.targetUnit.create({
    data: {
      itemId: items[3].id,
      materialName: 'Ti 3" 0.250t',
      purity: "4N (99.99%)",
      hasCopper: "무",
      status: "available",
    },
  });

  console.log("✅ 타겟 유닛 생성 완료");

  // 6. 바코드
  const barcodes = await Promise.all([
    prisma.barcode.upsert({
      where: { code: "W-0042" },
      update: {},
      create: { code: "W-0042", itemId: items[0].id },
    }),
    prisma.barcode.upsert({
      where: { code: "W-0038" },
      update: {},
      create: { code: "W-0038", itemId: items[1].id },
    }),
    prisma.barcode.upsert({
      where: { code: "T-0187" },
      update: {},
      create: { code: "T-0187", itemId: items[2].id, targetUnitId: tu1.id },
    }),
    prisma.barcode.upsert({
      where: { code: "T-0188" },
      update: {},
      create: { code: "T-0188", itemId: items[3].id, targetUnitId: tu2.id },
    }),
    prisma.barcode.upsert({
      where: { code: "G-0023" },
      update: {},
      create: { code: "G-0023", itemId: items[5].id },
    }),
    prisma.barcode.upsert({
      where: { code: "G-0024" },
      update: {},
      create: { code: "G-0024", itemId: items[6].id },
    }),
  ]);

  console.log("✅ 바코드 생성 완료");

  // 7. 재고 트랜잭션
  await prisma.inventoryTx.createMany({
    data: [
      {
        date: new Date("2026-03-10"),
        type: "입고",
        itemId: items[0].id,
        quantity: 50,
        unitPrice: 125000,
        currency: "KRW",
        amount: 6250000,
        partnerId: partners[0].id,
        handlerName: "김철수",
        barcodeId: barcodes[0].id,
        createdBy: admin.id,
      },
      {
        date: new Date("2026-03-09"),
        type: "출고",
        itemId: items[2].id,
        quantity: 2,
        unitPrice: 890000,
        currency: "KRW",
        amount: 1780000,
        partnerId: partners[1].id,
        handlerName: "이영희",
        barcodeId: barcodes[2].id,
        createdBy: emp1.id,
      },
      {
        date: new Date("2026-03-09"),
        type: "입고",
        itemId: items[5].id,
        quantity: 10,
        unitPrice: 45000,
        currency: "KRW",
        amount: 450000,
        partnerId: partners[2].id,
        handlerName: "박민수",
        barcodeId: barcodes[4].id,
        createdBy: emp2.id,
      },
      {
        date: new Date("2026-03-08"),
        type: "불출",
        itemId: items[7].id,
        quantity: 100,
        unitPrice: 2500,
        currency: "KRW",
        amount: 250000,
        partnerId: partners[5].id,
        handlerName: "정수진",
        createdBy: emp3.id,
      },
      {
        date: new Date("2026-03-08"),
        type: "입고",
        itemId: items[3].id,
        quantity: 5,
        unitPrice: 1200000,
        currency: "KRW",
        amount: 6000000,
        partnerId: partners[3].id,
        handlerName: "김철수",
        barcodeId: barcodes[3].id,
        createdBy: admin.id,
      },
      {
        date: new Date("2026-03-07"),
        type: "출고",
        itemId: items[1].id,
        quantity: 20,
        unitPrice: 185000,
        currency: "KRW",
        amount: 3700000,
        partnerId: partners[4].id,
        handlerName: "이영희",
        barcodeId: barcodes[1].id,
        createdBy: emp1.id,
      },
      {
        date: new Date("2026-03-07"),
        type: "입고",
        itemId: items[6].id,
        quantity: 15,
        unitPrice: 38000,
        currency: "KRW",
        amount: 570000,
        partnerId: partners[2].id,
        handlerName: "박민수",
        barcodeId: barcodes[5].id,
        createdBy: emp2.id,
      },
      {
        date: new Date("2026-03-06"),
        type: "불출",
        itemId: items[8].id,
        quantity: 200,
        unitPrice: 1800,
        currency: "KRW",
        amount: 360000,
        partnerId: partners[6].id,
        handlerName: "정수진",
        createdBy: emp3.id,
      },
    ],
  });

  console.log("✅ 재고 트랜잭션 생성 완료");

  // 8. 타겟 측정 로그
  await prisma.targetLog.createMany({
    data: [
      {
        targetUnitId: tu1.id,
        type: "측정",
        weight: 188.1,
        location: "Storage-B",
        reason: "입고 시 측정",
        userId: emp1.id,
      },
      {
        targetUnitId: tu1.id,
        type: "측정",
        weight: 185.2,
        location: "Chamber-A",
        reason: "공정 전 측정",
        userId: admin.id,
      },
      {
        targetUnitId: tu1.id,
        type: "측정",
        weight: 182.45,
        location: "Chamber-A",
        reason: "공정 후 측정",
        userId: admin.id,
      },
      {
        targetUnitId: tu2.id,
        type: "측정",
        weight: 245.8,
        location: "Storage-A",
        reason: "입고 시 측정",
        userId: emp2.id,
      },
    ],
  });

  console.log("✅ 타겟 로그 생성 완료");

  // 9. 필요수량
  await prisma.requiredQty.createMany({
    data: [
      { itemId: items[0].id, quantity: 30 },
      { itemId: items[1].id, quantity: 15 },
      { itemId: items[2].id, quantity: 5 },
      { itemId: items[3].id, quantity: 5 },
      { itemId: items[4].id, quantity: 4 },
      { itemId: items[5].id, quantity: 5 },
      { itemId: items[6].id, quantity: 10 },
      { itemId: items[7].id, quantity: 100 },
      { itemId: items[8].id, quantity: 200 },
    ],
  });

  console.log("✅ 필요수량 생성 완료");
  console.log("시드 데이터 삽입 완료!");
}

main()
  .catch((e) => {
    console.error("❌ 시드 오류:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });