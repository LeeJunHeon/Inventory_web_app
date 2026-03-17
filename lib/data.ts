// ──────── 타입 정의 ────────
export interface InventoryItem {
  id: number;
  date: string;
  type: "입고" | "출고" | "불출";
  category: string;
  code: string;
  name: string;
  price: number;
  qty: number;
  amount: number;
  currency: string;
  partner: string;
  handler: string;
  memo: string;
  barcode: string;
  location: string;
  waferResistance: string;
  waferThickness: string;
  waferDirection: string;
  waferSurface: string;
}

export interface TargetUnit {
  id: number;
  barcodeCode: string;
  itemCode: string;
  itemName: string;
  materialName: string;
  status: "available" | "using" | "disposed";
  memo: string;
}

export interface TargetLog {
  id: number;
  targetId: number;
  timestamp: string;
  type: "측정" | "폐기" | "상태변경";
  weight: number | null;
  location: string;
  reason: string;
  userName: string;
  barcodeCode: string;
  itemName: string;
}

// ──────── 상수 ────────
export const CATEGORIES = ["전체", "웨이퍼", "타겟", "가스", "기자재/소모품"];
export const TYPES = ["전체", "입고", "출고", "불출"];

export const TYPE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "입고": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  "출고": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" },
  "불출": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
};

export const CATEGORY_COLORS: Record<string, string> = {
  "웨이퍼": "bg-violet-100 text-violet-700",
  "타겟": "bg-sky-100 text-sky-700",
  "가스": "bg-emerald-100 text-emerald-700",
  "기자재/소모품": "bg-orange-100 text-orange-700",
};

export const TARGET_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  "available": { label: "사용가능", color: "bg-emerald-100 text-emerald-700" },
  "using":     { label: "사용중",   color: "bg-blue-100 text-blue-700" },
  "disposed":  { label: "폐기",     color: "bg-gray-100 text-gray-500" },
};

// ──────── 포맷터 ────────
export const formatPrice  = (v: number) => v ? `₩${v.toLocaleString()}` : "-";
export const formatQty    = (v: number) => v ? v.toLocaleString() : "0";
export const formatWeight = (v: number | null) => v !== null ? `${v.toFixed(3)}g` : "-";
