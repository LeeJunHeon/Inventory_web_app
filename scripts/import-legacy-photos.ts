/**
 * NAS 레거시 타겟 사진 임포트.
 *
 * 사진은 입고가 아니라 "무게 측정할 때 같이 찍은 것"이므로 target_log 기준으로 붙인다.
 * (입고 기준 매칭은 133그룹 중 0건 일치 — 근거는 Obsidian Target_Photo_Design.md)
 *
 * 실행 (노트북 PowerShell):
 *   $env:LEGACY_DB_URL="postgresql://USER:PASS@NAS_IP:5433/inventory"
 *   npx tsx scripts/import-legacy-photos.ts --root "\\VanaM_NAS\VanaM_Sputter\Target images" --year 2026 --dry-run
 *
 * 옵션:
 *   --root <path>      NAS "Target images" 폴더 (필수)
 *   --year <YYYY>      대상 연도 (기본 2026)
 *   --dry-run          DB에 쓰지 않고 매칭 결과만 출력
 *   --limit <N>        앞에서 N장만 처리 (시범용)
 *   --material <CODE>  특정 물질만 (예: --material CeO2)
 *   --include-uncertain  추정(candidate)·미매칭(unmatched)까지 함께 적재.
 *                        기본값은 CONFIRMED(같은 날 측정 1건)만 적재한다.
 *
 * 되돌리기:  DELETE FROM target_photo WHERE source = 'legacy';
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

// ── 인자 ────────────────────────────────────────────────
const argv = process.argv.slice(2);
const getArg = (name: string): string | null => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const ROOT     = getArg("root");
const YEAR     = getArg("year") ?? "2026";
const DRY_RUN  = argv.includes("--dry-run");
const LIMIT    = getArg("limit") ? Number(getArg("limit")) : null;
const ONLY_MAT = getArg("material");
// 기본은 근거가 확실한 CONFIRMED 만 적재한다. 추정분을 섞으면 나중에
// 어느 게 확실했는지 구분이 안 된다. 필요할 때 이 플래그로 추가 적재한다
// (source_path UNIQUE 라 다시 돌려도 중복되지 않는다).
const INCLUDE_UNCERTAIN = argv.includes("--include-uncertain");

if (!ROOT) {
  console.error("--root 가 필요합니다. 예: --root \"\\\\VanaM_NAS\\VanaM_Sputter\\Target images\"");
  process.exit(1);
}
if (!fs.existsSync(ROOT)) {
  console.error(`경로를 찾을 수 없습니다: ${ROOT}`);
  process.exit(1);
}

const DB_URL = process.env.LEGACY_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("LEGACY_DB_URL 또는 DATABASE_URL 환경변수가 필요합니다.");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

// ── 이미지 규격 (lib/targetPhoto.ts 와 동일하게 유지할 것) ──
const MAIN_MAX_PX = 1600, MAIN_QUALITY = 80;
const THUMB_MAX_PX = 320, THUMB_QUALITY = 70;
// 사진을 먼저 찍고 며칠 뒤 측정값을 입력하는 관행 반영.
// DRY-RUN 실측 gap 분포: ±1일 29건, ±2~3일 17건, ±4일 이상 6건.
// ±3일까지가 실제 관행 범위(46/52=88%)이고, ±4일 이상은 근거가 약해
// 다른 측정에 잘못 붙을 위험이 더 크다 → 붙이지 않고 unmatched 로 둔다.
const NEAR_DAYS = 3;

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png"]);

/**
 * 물질코드는 DB(target_spec.material_code)에서 읽어온다.
 * 하드코딩하면 새 물질 폴더가 생길 때마다(예: 2026-08 'Al') 그 폴더가 통째로
 * 미매칭으로 빠지고 아무도 눈치채지 못한다. 비교는 대문자 기준.
 */
const MATERIALS = new Set<string>();
async function loadMaterials() {
  const rows = await prisma.targetSpec.findMany({
    select: { materialCode: true }, distinct: ["materialCode"],
  });
  for (const r of rows) MATERIALS.add(r.materialCode.toUpperCase());
  console.log(`물질코드 ${MATERIALS.size}종 로드 (DB target_spec 기준)`);
}

type Parsed = {
  absPath: string; relPath: string; fileName: string;
  date: string | null; material: string | null; sizeInch: number | null;
  maker: string | null; tag: string | null; seq: number;
  errors: string[];
};

// ── 파일 수집 ───────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "@eaDir") continue;                 // Synology 메타
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (IMAGE_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

// ── 파일명 파싱 ─────────────────────────────────────────
function parseFile(absPath: string): Parsed {
  const relPath  = path.relative(ROOT!, absPath).split(path.sep).join("/");
  const folder   = relPath.split("/")[0];
  const fileName = path.basename(absPath);
  const r: Parsed = {
    absPath, relPath, fileName,
    date: null, material: null, sizeInch: null, maker: null, tag: null, seq: 1, errors: [],
  };

  let stem = fileName.replace(/\.[^.]+$/, "");

  // 연번 " (n)" 또는 "_(n)" — 같은 타겟의 여러 컷
  const mSeq = stem.match(/[ _]?\((\d+)\)\s*$/);
  if (mSeq) { r.seq = Number(mSeq[1]); stem = stem.slice(0, mSeq.index!); }

  // 날짜
  const mDate = stem.match(/^(\d{8})[ _]/);
  if (mDate) { r.date = mDate[1]; stem = stem.slice(mDate[0].length); }
  else { r.errors.push("NO_DATE"); }

  // 현미경 배율 (타겟 입고 OM 폴더)
  const mOm = stem.match(/타겟 입고 OM[ _]?X(\d+)/);
  if (mOm) { r.tag = "OM"; stem = stem.replace(mOm[0], ""); }

  // 상태 태그
  for (const t of ["before sanding", "after sanding"]) {
    if (stem.toLowerCase().includes(t)) {
      r.tag = t.replace(" ", "_");
      stem = stem.replace(new RegExp(`[_ ]?${t}`, "i"), "");
    }
  }
  if (stem.includes("SnO2-ZnO")) { r.tag = "SnO2-ZnO"; stem = stem.replace("SnO2-ZnO", ""); }

  // 사이즈
  const mSize = stem.match(/(\d+(?:\.\d+)?)\s*inch/i);
  if (mSize) { r.sizeInch = Number(mSize[1]); stem = stem.replace(mSize[0], ""); }
  else { r.errors.push("NO_SIZE"); }

  // 물질 + 제조사
  const toks = stem.split(/[_ ]+/).filter(Boolean);
  let mat: string | null = null;
  for (const t of toks) {
    if (MATERIALS.has(t.toUpperCase())) { mat = t; toks.splice(toks.indexOf(t), 1); break; }
  }
  r.material = mat ?? (MATERIALS.has(folder.toUpperCase()) ? folder : null);
  if (!r.material) r.errors.push("NO_MATERIAL");
  const leftover = toks.join(" ").trim();
  if (leftover) r.maker = leftover;

  // ⚠️ 유일한 물질코드 예외: ZTO 폴더 + SnO2-ZnO 태그는 DB 물질코드가 SNO2ZNO 다
  if (r.material === "ZTO" && r.tag === "SnO2-ZnO") r.material = "SNO2ZNO";

  return r;
}

// ── 매칭 ────────────────────────────────────────────────
type Match = {
  verdict: "CONFIRMED" | "CONFIRMED_NEAR" | "CANDIDATE" | "UNMATCHED";
  targetUnitId: number | null;
  targetLogId: number | null;
  gapDays: number | null;
};

async function measuredUnitsOn(dayStart: Date, dayEnd: Date, mat: string, inch: number) {
  return prisma.targetLog.findMany({
    where: {
      logType: "측정",
      loggedAt: { gte: dayStart, lt: dayEnd },
      targetUnit: {
        category: "sputter",
        item: { targetSpec: { materialCode: { equals: mat, mode: "insensitive" }, diameterInch: inch } },
      },
    },
    select: { id: true, targetUnitId: true, loggedAt: true },
    orderBy: { loggedAt: "asc" },
  });
}

// ⚠️ target_log.logged_at 은 KST 벽시계를 naive timestamp 로 저장한 값이고
//    Prisma 는 그걸 UTC 로 해석해 Date 를 만든다. 따라서 비교용 경계도 반드시
//    UTC 자정("...Z")으로 만들어야 한다. 로컬(KST) 자정으로 만들면 9시간 어긋난다.
//    taken_date(@db.Date) 도 같은 이유로 UTC 자정이어야 날짜가 밀리지 않는다.
const dayOf = (ymd: string) =>
  new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

async function match(p: Parsed): Promise<Match> {
  const none: Match = { verdict: "UNMATCHED", targetUnitId: null, targetLogId: null, gapDays: null };
  if (!p.date || !p.material || p.sizeInch == null) return none;

  const inch = Math.round(p.sizeInch);
  const d0 = dayOf(p.date);

  // ① 같은 날
  const same = await measuredUnitsOn(d0, addDays(d0, 1), p.material, inch);
  const sameUnits = [...new Set(same.map(l => l.targetUnitId))];
  if (sameUnits.length === 1) {
    const unitLogs = same.filter(l => l.targetUnitId === sameUnits[0]);
    return {
      verdict: "CONFIRMED",
      targetUnitId: sameUnits[0],
      targetLogId: unitLogs.length === 1 ? unitLogs[0].id : null,  // 여러 건이면 유닛까지만
      gapDays: 0,
    };
  }
  if (sameUnits.length > 1) {
    return { verdict: "CANDIDATE", targetUnitId: null, targetLogId: null, gapDays: 0 };
  }

  // ② ±NEAR_DAYS 내 가장 가까운 날
  const near = await measuredUnitsOn(addDays(d0, -NEAR_DAYS), addDays(d0, NEAR_DAYS + 1), p.material, inch);
  if (near.length === 0) return none;

  const byDay = new Map<string, typeof near>();
  for (const l of near) {
    const k = l.loggedAt.toISOString().slice(0, 10);   // naive=KST 이므로 그대로 KST 날짜
    const arr = byDay.get(k);
    if (arr) arr.push(l);
    else byDay.set(k, [l]);
  }
  const best = [...byDay.entries()]
    .map(([k, logs]) => ({ k, logs, gap: Math.round((new Date(k + "T00:00:00Z").getTime() - d0.getTime()) / 86400000) }))
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap) || a.gap - b.gap)[0];

  const nearUnits = [...new Set(best.logs.map(l => l.targetUnitId))];
  if (nearUnits.length === 1) {
    const unitLogs = best.logs.filter(l => l.targetUnitId === nearUnits[0]);
    return {
      verdict: "CONFIRMED_NEAR",
      targetUnitId: nearUnits[0],
      targetLogId: unitLogs.length === 1 ? unitLogs[0].id : null,
      gapDays: best.gap,
    };
  }
  return { verdict: "CANDIDATE", targetUnitId: null, targetLogId: null, gapDays: best.gap };
}

// ── 메인 ────────────────────────────────────────────────
async function main() {
  await loadMaterials();
  console.log(`\n📁 ${ROOT}`);
  console.log(`   연도 ${YEAR} / ${DRY_RUN ? "DRY-RUN (DB 미기록)" : "실제 적재"}` +
              `${LIMIT ? ` / 최대 ${LIMIT}장` : ""}${ONLY_MAT ? ` / 물질 ${ONLY_MAT}` : ""}` +
              `\n   적재 대상: ${INCLUDE_UNCERTAIN ? "전체 (확정+추정+미매칭)" : "CONFIRMED 만 (같은 날 측정 1건)"}\n`);

  let files = walk(ROOT!).map(parseFile).filter(p => p.date?.startsWith(YEAR));
  if (ONLY_MAT) files = files.filter(p => (p.material ?? "").toUpperCase() === ONLY_MAT.toUpperCase());
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  if (LIMIT) files = files.slice(0, LIMIT);

  console.log(`대상 ${files.length}장\n`);

  const stat: Record<string, number> = {
    CONFIRMED: 0, CONFIRMED_NEAR: 0, CANDIDATE: 0, UNMATCHED: 0,
    SKIPPED: 0, HELD: 0, FAILED: 0,
  };
  const failures: string[] = [];
  const parseIssues = files
    .filter(p => p.errors.length > 0)
    .map(p => `${p.relPath} — ${p.errors.join(", ")}`);
  const matchCache = new Map<string, Match>();
  let bytesIn = 0, bytesOut = 0;

  for (const [i, p] of files.entries()) {
    const prefix = `[${String(i + 1).padStart(3)}/${files.length}]`;

    // 이미 적재된 파일이면 건너뛴다 (source_path UNIQUE — 몇 번을 다시 돌려도 안전)
    const dup = await prisma.targetPhoto.findFirst({
      where: { sourcePath: p.relPath }, select: { id: true },
    });
    if (dup) { stat.SKIPPED++; continue; }

    // 같은 그룹은 매칭 결과를 재사용한다 (그룹당 쿼리 1회)
    const key = [p.date, p.material, p.sizeInch, p.maker, p.tag].join("|");
    let m = matchCache.get(key);
    if (!m) { m = await match(p); matchCache.set(key, m); }
    stat[m.verdict]++;

    // 같은 날 측정 1건만 confirmed. 근접(±NEAR_DAYS) 매칭은 추정이므로 candidate 로 낮춘다.
    // 화면에서 앰버 '추정' 배지가 붙어, 나중에 검토 대상이 명확해진다.
    const status =
      m.verdict === "CONFIRMED" ? "confirmed"
      : m.verdict === "UNMATCHED" ? "unmatched"
      : "candidate";

    console.log(`${prefix} ${m.verdict.padEnd(14)} ${m.gapDays !== null && m.gapDays !== 0 ? `(${m.gapDays > 0 ? "+" : ""}${m.gapDays}d)` : "     "} ` +
                `unit=${String(m.targetUnitId ?? "-").padStart(4)} log=${String(m.targetLogId ?? "-").padStart(5)}  ${p.relPath}`);

    // 확정분이 아니면 적재하지 않고 보류한다 (--include-uncertain 으로 나중에 추가 가능)
    if (!INCLUDE_UNCERTAIN && m.verdict !== "CONFIRMED") { stat.HELD++; continue; }

    if (DRY_RUN) continue;

    try {
      const input = fs.readFileSync(p.absPath);
      bytesIn += input.length;
      const pipeline = sharp(input, { failOn: "none" }).rotate();
      const main = await pipeline.clone()
        .resize({ width: MAIN_MAX_PX, height: MAIN_MAX_PX, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: MAIN_QUALITY, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      const thumb = await pipeline.clone()
        .resize({ width: THUMB_MAX_PX, height: THUMB_MAX_PX, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
        .toBuffer();
      bytesOut += main.data.length + thumb.length;

      await prisma.targetPhoto.create({
        data: {
          targetLogId:  m.targetLogId,
          targetUnitId: m.targetUnitId,
          fileName:     p.fileName.replace(/\.[^.]+$/, "") + ".jpg",
          mimeType:     "image/jpeg",
          fileData:     main.data.toString("base64"),
          thumbData:    thumb.toString("base64"),
          fileSize:     main.data.length,
          width:        main.info.width,
          height:       main.info.height,
          takenDate:    p.date ? dayOf(p.date) : null,
          materialCode: p.material,
          diameterInch: p.sizeInch != null ? Math.round(p.sizeInch) : null,
          maker:        p.maker,
          tag:          p.tag,
          source:       "legacy",
          matchStatus:  status,
          sourcePath:   p.relPath,
        },
      });
    } catch (e) {
      stat.FAILED++;
      failures.push(`${p.relPath} — ${(e as Error).message}`);
      console.log(`      ⚠️ 실패: ${(e as Error).message}`);
    }
  }

  const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + "MB";
  console.log("\n────────── 요약 ──────────");
  for (const k of ["CONFIRMED", "CONFIRMED_NEAR", "CANDIDATE", "UNMATCHED", "SKIPPED", "HELD", "FAILED"]) {
    if (stat[k]) console.log(`  ${k.padEnd(15)} ${stat[k]}`);
  }
  const auto = stat.CONFIRMED + stat.CONFIRMED_NEAR;
  const total = auto + stat.CANDIDATE + stat.UNMATCHED;
  if (total) console.log(`  자동확정 ${auto}/${total} (${Math.round((auto / total) * 100)}%)`);
  if (stat.HELD) {
    console.log(`  ⏸ 보류 ${stat.HELD}장 — 확정분이 아니어서 적재하지 않았다.`);
    console.log(`     나중에 넣으려면 같은 명령에 --include-uncertain 을 붙여 다시 실행.`);
  }
  if (!DRY_RUN && bytesIn) {
    console.log(`  원본 ${mb(bytesIn)} → 저장 ${mb(bytesOut)} (base64 환산 약 ${mb(bytesOut * 1.34)})`);
  }
  if (parseIssues.length) {
    console.log(`\n⚠️ 파일명 파싱 불완전 ${parseIssues.length}장 — 물질/사이즈를 못 읽어 매칭이 불가능하다.`);
    console.log("   새 물질 폴더가 생겼는데 DB 품목이 없거나, 파일명 규칙이 다른 경우다.");
    for (const f of parseIssues.slice(0, 30)) console.log("  - " + f);
    if (parseIssues.length > 30) console.log(`  ... 외 ${parseIssues.length - 30}장`);
  }
  if (failures.length) {
    console.log("\n실패 목록:");
    for (const f of failures) console.log("  - " + f);
  }
  console.log(DRY_RUN ? "\n※ DRY-RUN 이라 DB에 아무것도 쓰지 않았습니다.\n" : "\n완료.\n");
}

main()
  .catch(e => { console.error("\n❌ 중단:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
