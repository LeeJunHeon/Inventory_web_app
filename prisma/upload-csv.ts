import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

const CSV_DIR = "C:/Users/wnsgj/Desktop/Inventory program/WebApp/DB/현재 버전";

// ── 헬퍼 ────────────────────────────────────────────────
function readCsv(filename: string): Record<string, string>[] {
  const filePath = path.join(CSV_DIR, filename);
  const content  = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, ""); // BOM 제거
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

const toInt  = (v: string) => (v?.trim() ? parseInt(v, 10)  : null);
const toDec  = (v: string) => (v?.trim() ? parseFloat(v)    : null);
const toDate = (v: string) => (v?.trim() ? new Date(v)       : null);

// "true"/"false" → "Y"/"N"
const toYN = (v: string) =>
  v === "true" || v === "Y" ? "Y" : v === "false" || v === "N" ? "N" : (v || "Y");

function req<T>(v: T | null, col: string): T {
  if (v === null || v === undefined) throw new Error(`필수값 누락: ${col}`);
  return v;
}

// ── 메인 ────────────────────────────────────────────────
async function main() {
  console.log("📦 CSV → Supabase 업로드 시작...\n");

  // 1. item_category
  {
    const rows = readCsv("item_category.csv");
    await prisma.itemCategory.createMany({
      data: rows.map(r => ({
        id:       req(toInt(r.id),   "id"),
        name:     r.name,
        parentId: toInt(r.parent_id),
      })),
      skipDuplicates: true,
    });
    console.log(`✓ item_category      : ${rows.length}건`);
  }

  // 2. location
  {
    const rows = readCsv("location.csv");
    await prisma.location.createMany({
      data: rows.map(r => ({
        id:      req(toInt(r.id), "id"),
        name:    r.name,
        address: r.address || null,
      })),
      skipDuplicates: true,
    });
    console.log(`✓ location           : ${rows.length}건`);
  }

  // 3. tx_reason
  {
    const rows = readCsv("tx_reason.csv");
    await prisma.txReason.createMany({
      data: rows.map(r => ({
        id:          req(toInt(r.id), "id"),
        name:        r.name,
        description: r.description || null,
      })),
      skipDuplicates: true,
    });
    console.log(`✓ tx_reason          : ${rows.length}건`);
  }

  // 4. partner
  {
    const rows = readCsv("partner.csv");
    await prisma.partner.createMany({
      data: rows.map(r => ({
        id:          req(toInt(r.id), "id"),
        name:        r.name,
        managerName: r.manager_name || null,
        contact:     r.contact      || null,
        email:       r.email        || null,
      })),
      skipDuplicates: true,
    });
    console.log(`✓ partner            : ${rows.length}건`);
  }

  // 5. user
  {
    const rows = readCsv("user.csv");
    await prisma.user.createMany({
      data: rows.map(r => ({
        id:           req(toInt(r.id), "id"),
        name:         r.name,
        email:        r.email         || null,
        role:         r.role          || null,
        isActive:     toYN(r.is_active),
        passwordHash: r.password_hash || null,
      })),
      skipDuplicates: true,
    });
    console.log(`✓ user               : ${rows.length}건`);
  }

  // 6. user_tab_permission
  {
    const rows = readCsv("user_tab_permission.csv");
    await prisma.userTabPermission.createMany({
      data: rows.map(r => ({
        userId:                   req(toInt(r.user_id), "user_id"),
        canViewMain:              toYN(r.can_view_main),
        canViewStatus:            toYN(r.can_view_status),
        canViewPeriod:            toYN(r.can_view_period),
        canViewUserPerm:          toYN(r.can_view_user_perm),
        canViewTargetUsage:       toYN(r.can_view_target_usage),
        canViewBarcode:           toYN(r.can_view_barcode),
        canViewBarcodeCreatePrint:toYN(r.can_view_barcode_create_print),
      })),
      skipDuplicates: true,
    });
    console.log(`✓ user_tab_permission: ${rows.length}건`);
  }

  // 7. item
  {
    const rows = readCsv("item.csv");
    await prisma.item.createMany({
      data: rows.map(r => ({
        id:          req(toInt(r.id),          "id"),
        categoryId:  req(toInt(r.category_id), "category_id"),
        code:        r.code,
        name:        r.name,
        unit:        r.unit  || null,
        minStockQty: toInt(r.min_stock_qty) ?? 0,
        note:        r.note  || null,
      })),
      skipDuplicates: true,
    });
    console.log(`✓ item               : ${rows.length}건`);
  }

  // 8. wafer_spec
  {
    const rows = readCsv("wafer_spec.csv");
    await prisma.waferSpec.createMany({
      data: rows.map(r => ({
        itemId:        req(toInt(r.item_id),       "item_id"),
        diameterInch:  req(toInt(r.diameter_inch), "diameter_inch"),
        waferType:     r.wafer_type     || null,
        dopant:        r.dopant         || null,
        grade:         r.grade          || null,
        thicknessNote: r.thickness_note || null,
        resistivity:   r.resistivity    || null,
        orientation:   r.orientation    || null,
        surface:       r.surface        || null,
        oxidation:     r.oxidation      || null,
      })),
      skipDuplicates: true,
    });
    console.log(`✓ wafer_spec         : ${rows.length}건`);
  }

  // 9. target_spec
  {
    const rows = readCsv("target_spec.csv");
    await prisma.targetSpec.createMany({
      data: rows.map(r => ({
        itemId:        req(toInt(r.item_id),       "item_id"),
        diameterInch:  req(toInt(r.diameter_inch), "diameter_inch"),
        thicknessInch: toDec(r.thickness_inch),
        materialCode:  r.material_code,
        purity:        toDec(r.purity),
        hasCopper:     r.has_copper || null,
      })),
      skipDuplicates: true,
    });
    console.log(`✓ target_spec        : ${rows.length}건`);
  }

  // 10. target_unit
  {
    const rows = readCsv("target_unit.csv");
    await prisma.targetUnit.createMany({
      data: rows.map(r => ({
        id:         req(toInt(r.id),      "id"),
        itemId:     req(toInt(r.item_id), "item_id"),
        status:     r.status || "available",
        createdAt:  req(toDate(r.created_at), "created_at"),
        disposedAt: toDate(r.disposed_at),
        note:       r.note || null,
      })),
      skipDuplicates: true,
    });
    console.log(`✓ target_unit        : ${rows.length}건`);
  }

  // 11. barcode_seq
  {
    const rows = readCsv("barcode_seq.csv");
    await prisma.barcodeSeq.createMany({
      data: rows.map(r => ({
        prefix: r.prefix,
        lastNo: req(toInt(r.last_no), "last_no"),
      })),
      skipDuplicates: true,
    });
    console.log(`✓ barcode_seq        : ${rows.length}건`);
  }

  // 12. barcode
  {
    const rows = readCsv("barcode.csv");
    await prisma.barcode.createMany({
      data: rows.map(r => ({
        id:           req(toInt(r.id), "id"),
        code:         r.code,
        itemId:       toInt(r.item_id),
        targetUnitId: toInt(r.target_unit_id),
        isActive:     toYN(r.is_active),
      })),
      skipDuplicates: true,
    });
    console.log(`✓ barcode            : ${rows.length}건`);
  }

  // 13. inventory_tx
  {
    const rows = readCsv("inventory_tx.csv");
    await prisma.inventoryTx.createMany({
      data: rows.map(r => ({
        id:           req(toInt(r.id),          "id"),
        txNo:         r.tx_no                  || null,
        txDate:       req(toDate(r.tx_date),    "tx_date"),
        txType:       r.tx_type,
        itemId:       req(toInt(r.item_id),     "item_id"),
        targetUnitId: toInt(r.target_unit_id),
        qty:          req(toInt(r.qty),         "qty"),
        unitPrice:    toDec(r.unit_price),
        amount:       toDec(r.amount),
        partnerId:    toInt(r.partner_id),
        txReasonId:   toInt(r.tx_reason_id),
        locationId:   req(toInt(r.location_id), "location_id"),
        userId:       toInt(r.user_id),
        memo:         r.memo                   || null,
        refTxNo:      r.ref_tx_no              || null,
        barcodeId:    toInt(r.barcode_id),
      })),
      skipDuplicates: true,
    });
    console.log(`✓ inventory_tx       : ${rows.length}건`);
  }

  // 14. target_log (CSV 컬럼명: timestamp → schema: loggedAt)
  {
    const rows = readCsv("target_log.csv");
    await prisma.targetLog.createMany({
      data: rows.map(r => ({
        id:           req(toInt(r.id),              "id"),
        targetUnitId: req(toInt(r.target_unit_id),  "target_unit_id"),
        logType:      r.log_type,
        weight:       toDec(r.weight),
        locationId:   toInt(r.location_id),
        reason:       r.reason || null,
        userId:       toInt(r.user_id),
        loggedAt:     req(toDate(r.timestamp ?? r.logged_at), "timestamp"),
      })),
      skipDuplicates: true,
    });
    console.log(`✓ target_log         : ${rows.length}건`);
  }

  // 15. barcode_scan
  {
    const rows = readCsv("barcode_scan.csv");
    await prisma.barcodeScan.createMany({
      data: rows.map(r => ({
        id:            req(toInt(r.id),          "id"),
        barcodeId:     req(toInt(r.barcode_id),  "barcode_id"),
        scanTime:      req(toDate(r.scan_time),  "scan_time"),
        opType:        r.op_type              || null,
        txReasonId:    toInt(r.tx_reason_id),
        userId:        toInt(r.user_id),
        qty:           req(toInt(r.qty),         "qty"),
        inventoryTxId: toInt(r.inventory_tx_id),
      })),
      skipDuplicates: true,
    });
    console.log(`✓ barcode_scan       : ${rows.length}건`);
  }

  console.log("\n✅ 전체 업로드 완료!");
}

main()
  .catch(e => { console.error("\n❌ 업로드 실패:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
