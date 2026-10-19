import * as XLSX from "xlsx";

export type XlsxCell = string | number | null | undefined;

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: XlsxCell[][];
  /** numFmts[i]: i번째 열 숫자 셀의 표시 형식 (예: "0.000") */
  numFmts?: (string | undefined)[];
}

function buildWorksheet({ headers, rows, numFmts }: XlsxSheet): XLSX.WorkSheet {
  const data = [headers, ...rows.map(r => r.map(v => v ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = headers.map((_, ci) => {
    const maxLen = data.reduce((m, row) => {
      const s = String(row[ci] ?? "");
      // 한글 등 전각 문자는 폭 2로 계산
      const w = [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
      return Math.max(m, w);
    }, 0);
    return { wch: Math.min(40, Math.max(8, maxLen + 2)) };
  });
  numFmts?.forEach((fmt, ci) => {
    if (!fmt) return;
    for (let ri = 1; ri < data.length; ri++) {
      const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })] as XLSX.CellObject | undefined;
      if (cell && cell.t === "n") cell.z = fmt;
    }
  });
  return ws;
}

/** 시트명 규칙(금지 문자 → 공백, 31자) + 같은 이름이면 " (2)" 식으로 31자 안에서 유일하게 */
function uniqueSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/:*?\[\]]/g, " ").slice(0, 31) || "Sheet1";
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** 여러 시트를 한 .xlsx 파일로 다운로드. 파일명 확장자는 자동 보정된다(.csv → .xlsx). */
export function exportXLSXSheets(sheets: XlsxSheet[], filename: string): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(wb, buildWorksheet(sheet), uniqueSheetName(sheet.name, used));
  }
  const withExt = filename.toLowerCase().endsWith(".xlsx")
    ? filename
    : filename.replace(/\.csv$/i, "") + ".xlsx";
  XLSX.writeFile(wb, withExt.replace(/[\\/:*?"<>|]/g, "_"));
}

/** 헤더+rows를 .xlsx로 다운로드. 파일명 확장자는 자동 보정된다(.csv → .xlsx). */
export function exportXLSX(
  headers: string[],
  rows: XlsxCell[][],
  filename: string,
  sheetName = "Sheet1"
): void {
  exportXLSXSheets([{ name: sheetName, headers, rows }], filename);
}

/** 브라우저 로컬 날짜 YYYY-MM-DD (toISOString 은 UTC 라 KST 오전 9시 전엔 어제가 된다) */
export function todayStamp(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
