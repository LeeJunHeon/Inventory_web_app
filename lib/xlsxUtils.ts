import * as XLSX from "xlsx";

/** 헤더+rows를 .xlsx로 다운로드. 파일명 확장자는 자동 보정된다(.csv → .xlsx). */
export function exportXLSX(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  filename: string,
  sheetName = "Sheet1"
): void {
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
  const wb = XLSX.utils.book_new();
  const safeSheet = sheetName.replace(/[\\/:*?\[\]]/g, " ").slice(0, 31) || "Sheet1";
  XLSX.utils.book_append_sheet(wb, ws, safeSheet);
  const safeName = filename.toLowerCase().endsWith(".xlsx")
    ? filename
    : filename.replace(/\.csv$/i, "") + ".xlsx";
  XLSX.writeFile(wb, safeName);
}
