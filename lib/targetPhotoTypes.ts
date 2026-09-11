/** GET /api/target-photos 의 항목 (이미지 본문은 포함되지 않는다) */
export interface TargetPhoto {
  id: number;
  targetLogId: number | null;
  targetUnitId: number | null;
  fileName: string;
  takenDate: string | null;
  tag: string | null;
  matchStatus: string | null;
  uploaderName: string;
  materialCode?: string | null;
  diameterInch?: number | null;
  barcodeCode?: string | null;
}
