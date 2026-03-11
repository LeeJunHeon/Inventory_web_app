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
  partner: string;
  handler: string;
  memo: string;
  barcode: string;
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

// ──────── 샘플 데이터 ────────
export const SAMPLE_INVENTORY: InventoryItem[] = [
  { id: 1, date: "2026.03.10", type: "입고", category: "웨이퍼", code: "W4P0BT-89", name: '4" P-type Boron 웨이퍼', price: 125000, qty: 50, amount: 6250000, partner: "(주)실리콘밸리", handler: "김철수", memo: "", barcode: "W-0042" },
  { id: 2, date: "2026.03.09", type: "출고", category: "타겟", code: "T-AU-3N", name: "Au Target 3N 2인치", price: 890000, qty: 2, amount: 1780000, partner: "삼성전자", handler: "이영희", memo: "긴급 출고 요청", barcode: "T-0187" },
  { id: 3, date: "2026.03.09", type: "입고", category: "가스", code: "G-AR-HP", name: "Ar 고순도 가스 (99.999%)", price: 45000, qty: 10, amount: 450000, partner: "에어코리아", handler: "박민수", memo: "", barcode: "G-0023" },
  { id: 4, date: "2026.03.08", type: "불출", category: "기자재/소모품", code: "E-GLV-CR", name: "클린룸 장갑 (M)", price: 2500, qty: 100, amount: 250000, partner: "생산 1팀", handler: "정수진", memo: "월간 정기 불출", barcode: "" },
  { id: 5, date: "2026.03.08", type: "입고", category: "타겟", code: "T-TI-4N", name: "Ti Target 4N 3인치", price: 1200000, qty: 5, amount: 6000000, partner: "(주)메탈소스", handler: "김철수", memo: "신규 거래처 첫 입고", barcode: "T-0188" },
  { id: 6, date: "2026.03.07", type: "출고", category: "웨이퍼", code: "W6P0SB-45", name: '6" P-type Sb 웨이퍼', price: 185000, qty: 20, amount: 3700000, partner: "LG이노텍", handler: "이영희", memo: "", barcode: "W-0038" },
  { id: 7, date: "2026.03.07", type: "입고", category: "가스", code: "G-N2-UHP", name: "N₂ 초고순도 가스", price: 38000, qty: 15, amount: 570000, partner: "에어코리아", handler: "박민수", memo: "", barcode: "G-0024" },
  { id: 8, date: "2026.03.06", type: "불출", category: "기자재/소모품", code: "E-WPR-A4", name: "클린룸 와이퍼 A4", price: 1800, qty: 200, amount: 360000, partner: "생산 2팀", handler: "정수진", memo: "", barcode: "" },
];

export const SAMPLE_TARGETS: TargetUnit[] = [
  { id: 1, barcodeCode: "T-0187", itemCode: "T-AU-3N", itemName: "Au Target 3N 2인치", materialName: "Au 2\" 0.125t", status: "using", memo: "Chamber-A 사용중" },
  { id: 2, barcodeCode: "T-0188", itemCode: "T-TI-4N", itemName: "Ti Target 4N 3인치", materialName: "Ti 3\" 0.250t", status: "available", memo: "" },
  { id: 3, barcodeCode: "T-0185", itemCode: "T-AL-4N", itemName: "Al Target 4N 2인치", materialName: "Al (99.99%)", status: "disposed", memo: "2026.02.28 폐기" },
];

export const SAMPLE_TARGET_LOGS: TargetLog[] = [
  { id: 1, targetId: 1, timestamp: "2026.03.10 14:30", type: "측정", weight: 182.450, location: "Chamber-A", reason: "공정 후 측정", userName: "김철수", barcodeCode: "T-0187", itemName: "Au Target 3N 2인치" },
  { id: 2, targetId: 1, timestamp: "2026.03.08 09:15", type: "측정", weight: 185.200, location: "Chamber-A", reason: "공정 전 측정", userName: "김철수", barcodeCode: "T-0187", itemName: "Au Target 3N 2인치" },
  { id: 3, targetId: 1, timestamp: "2026.03.05 16:00", type: "측정", weight: 188.100, location: "Storage-B", reason: "입고 시 측정", userName: "이영희", barcodeCode: "T-0187", itemName: "Au Target 3N 2인치" },
  { id: 4, targetId: 2, timestamp: "2026.03.08 10:00", type: "측정", weight: 245.800, location: "Storage-A", reason: "입고 시 측정", userName: "박민수", barcodeCode: "T-0188", itemName: "Ti Target 4N 3인치" },
  { id: 5, targetId: 3, timestamp: "2026.02.28 11:30", type: "폐기", weight: 45.200, location: "폐기장", reason: "수명 종료 폐기", userName: "김철수", barcodeCode: "T-0185", itemName: "Al Target 4N 2인치" },
  { id: 6, targetId: 3, timestamp: "2026.02.25 14:00", type: "측정", weight: 48.300, location: "Chamber-B", reason: "공정 후 측정", userName: "이영희", barcodeCode: "T-0185", itemName: "Al Target 4N 2인치" },
];

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
  "using": { label: "사용중", color: "bg-blue-100 text-blue-700" },
  "disposed": { label: "폐기", color: "bg-gray-100 text-gray-500" },
};

// ──────── 포맷터 ────────
export const formatPrice = (v: number) => v ? `₩${v.toLocaleString()}` : "-";
export const formatQty = (v: number) => v ? v.toLocaleString() : "0";
export const formatWeight = (v: number | null) => v !== null ? `${v.toFixed(3)}g` : "-";
