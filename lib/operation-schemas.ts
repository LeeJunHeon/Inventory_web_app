// lib/operation-schemas.ts
// 모든 챗봇 작업의 정의. 새 작업 = 여기 추가하면 끝.

export type FieldType =
  | "id_ref"    // 마스터 ID. LLM은 이름, 시스템이 ID 확정 (lookup 사용)
  | "number"    // 숫자값 (수량/무게/단가)
  | "date"      // 날짜
  | "text"      // 자유 텍스트
  | "enum"      // 선택값
  | "barcode";  // 바코드 (auto=시스템생성)

export interface SchemaField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  lookup?: string;
  validation?: string;
  auto?: "today" | "system_generate";
  enumValues?: string[]; // type이 "enum"일 때 가능한 값 목록
}

export interface SchemaStep {
  api: string;       // "POST /api/internal/..."
  body: string[];    // 보낼 필드명들 (고정값은 "key=value")
  returns?: string;  // 이 단계가 반환하는 값 (다음 step이 사용)
}

export interface OperationSchema {
  id: string;
  label: string;
  description: string;
  triggers: string[];
  appliesWhen?: { categoryName: string };
  fields: SchemaField[];
  steps: SchemaStep[];
  cardTitle: string;
  cardShow: string[];
}

export const OPERATION_SCHEMAS: OperationSchema[] = [
  {
    id: "partner_create",
    label: "거래처 등록",
    description: "새 거래처(공급처/고객)를 등록한다.",
    triggers: ["거래처 등록", "거래처 추가", "공급처 만들기"],
    fields: [
      { name: "name",        label: "거래처명", type: "text", required: true },
      { name: "managerName", label: "담당자",   type: "text", required: false },
      { name: "contact",     label: "연락처",   type: "text", required: false },
      { name: "email",       label: "이메일",   type: "text", required: false },
    ],
    steps: [
      { api: "POST /api/internal/partners", body: ["name", "managerName", "contact", "email"] },
    ],
    cardTitle: "거래처 등록 확인",
    cardShow: ["name", "managerName", "contact", "email"],
  },
  {
    id: "item_create",
    label: "품목 등록",
    description: "새 품목을 등록한다. 품목코드(code)는 사용자가 정한다.",
    triggers: ["품목 등록", "품목 추가", "새 품목"],
    fields: [
      { name: "code",        label: "품목코드", type: "text",   required: true },
      { name: "name",        label: "품목명",   type: "text",   required: true },
      { name: "categoryId",  label: "분류",     type: "id_ref", required: true, lookup: "list_categories" },
      { name: "unit",        label: "단위",     type: "text",   required: false },
      { name: "minStockQty", label: "최소재고", type: "number", required: false },
      { name: "note",        label: "비고",     type: "text",   required: false },
    ],
    steps: [
      { api: "POST /api/internal/items", body: ["code", "name", "categoryId", "unit", "minStockQty", "note"] },
    ],
    cardTitle: "품목 등록 확인",
    cardShow: ["code", "name", "categoryId", "unit", "minStockQty", "note"],
  },
  {
    id: "inventory_inbound",
    label: "입고",
    description: "일반 품목(가스/소모품/웨이퍼 등)을 입고한다. 타겟·ALD Canister는 별도 작업.",
    triggers: ["입고", "들어왔어", "재고 추가"],
    fields: [
      { name: "itemId",     label: "품목",   type: "id_ref", required: true,  lookup: "search_items" },
      { name: "qty",        label: "수량",   type: "number", required: true,  validation: "1 이상 정수" },
      { name: "partnerId",  label: "거래처", type: "id_ref", required: false, lookup: "search_partners" },
      { name: "currency",   label: "통화",   type: "enum",   required: false, enumValues: ["KRW", "USD"],
        validation: "KRW 또는 USD. 사용자가 달러라고 하면 USD, 원이라고 하거나 통화를 말하지 않으면 KRW(기본)." },
      { name: "locationId", label: "위치",   type: "id_ref", required: true,  lookup: "list_locations" },
      { name: "unitPrice",  label: "단가",   type: "number", required: false },
      { name: "memo",       label: "비고",   type: "text",   required: false },
      { name: "txDate",     label: "입고일", type: "date",   required: true,  auto: "today" },
    ],
    steps: [
      { api: "POST /api/internal/inventory",
        body: ["txType=입고", "itemId", "qty", "locationId", "unitPrice", "currency", "partnerId", "memo", "txDate"] },
    ],
    cardTitle: "입고 확인",
    cardShow: ["itemId", "qty", "locationId", "unitPrice", "currency", "partnerId", "memo"],
  },
  {
    id: "inventory_outbound",
    label: "출고/불출",
    description: "재고를 출고하거나 불출한다. 바코드가 있는 품목(웨이퍼/타겟/캐니스터)은 바코드로 출고하고, 바코드가 없는 품목(가스/소모품 등)은 어느 입고분(refTxNo)에서 빼는지 지정한다. 불출일 때는 누구에게 불출하는지(불출자)를 받을 수 있다.",
    triggers: ["출고", "불출", "내보내기", "빼줘"],
    fields: [
      { name: "itemId", label: "품목", type: "id_ref", required: false, lookup: "search_items" },
      { name: "barcodeId", label: "바코드", type: "barcode", required: false, lookup: "lookup_barcode",
        validation: "바코드가 있는 품목(웨이퍼/타겟/캐니스터)은 사용자가 바코드(예: C-30, T-35)를 직접 말하거나 품목명으로 목록을 보고 고른다. 바코드를 lookup_barcode로 조회하면 itemId와 refTxNo를 함께 반환하므로 그 값을 쓴다. 가스/소모품 등 바코드 없는 품목은 비워둔다." },
      { name: "refTxNo", label: "출고할 입고분", type: "text", required: true, lookup: "list_inbound_lots",
        validation: "바코드 품목이면 lookup_barcode가 반환한 refTxNo를 그대로 쓴다(다시 묻지 않는다). 바코드 없는 품목이면 list_inbound_lots로 잔여있는 입고건을 보여주고 사용자가 고른 전표번호(txNo)를 쓴다." },
      { name: "qty", label: "수량", type: "number", required: true,
        validation: "1 이상, 고른 입고분 잔여수량 이내. 타겟·캐니스터는 항상 1." },
      { name: "locationId", label: "위치", type: "id_ref", required: false, lookup: "list_locations",
        validation: "참조 입고분의 위치와 일치해야 함. 바코드 품목이면 보통 묻지 않아도 된다." },
      { name: "txType", label: "유형", type: "enum", required: true,
        enumValues: ["출고", "불출"],
        validation: "사용자의 말에 '출고'라는 단어가 있으면 즉시 '출고'를, '불출'이라는 단어가 있으면 즉시 '불출'을 이 필드에 넣는다. 이 경우 절대 되묻지 마라(사용자가 이미 명확히 말한 것이다). 사용자가 '출고'나 '불출' 둘 다 말하지 않고 '빼줘', '내보내줘'처럼 애매하게만 말한 경우에만, 마음대로 정하지 말고 '출고인가요, 불출인가요?'라고 한 번 되물어 확인한다. 요약: 단어가 있으면 바로 채우고 되묻지 않는다 / 단어가 없을 때만 되묻는다." },
      { name: "disburseeUserId", label: "불출받는 사람", type: "id_ref", required: false, lookup: "search_users",
        validation: "불출(txType=불출)일 때만 의미가 있다. 사용자가 누구에게 불출하는지 사람 이름을 말하면 search_users로 조회한다. 출고일 때는 비워둔다." },
      { name: "txReasonId", label: "사유", type: "id_ref", required: false, lookup: "list_tx_reasons",
        validation: "출고/불출 사유. 사용자가 사유를 말하면 list_tx_reasons 목록에서 맞는 것을 고른다. 안 주면 비워둔다(선택)." },
      { name: "partnerId", label: "거래처", type: "id_ref", required: false, lookup: "search_partners" },
      { name: "memo", label: "비고", type: "text", required: false },
      { name: "txDate", label: "일자", type: "date", required: true, auto: "today" },
    ],
    steps: [
      { api: "POST /api/internal/inventory",
        body: ["txType", "itemId", "qty", "locationId", "refTxNo", "barcodeId", "targetUnitId", "disburseeUserId", "txReasonId", "partnerId", "memo", "txDate"] },
    ],
    cardTitle: "출고/불출 확인",
    cardShow: ["itemId", "txType", "barcodeId", "refTxNo", "qty", "locationId", "disburseeUserId", "txReasonId", "partnerId", "memo"],
  },
  {
    id: "inventory_inbound_canister",
    label: "ALD 캐니스터 입고",
    description: "새 ALD 캐니스터를 입고한다. 바코드는 시스템이 자동 생성. 빈무게/총무게/재료가 필요.",
    triggers: ["캐니스터 입고", "캐니스터 들어왔어"],
    appliesWhen: { categoryName: "ALD Canister" },
    fields: [
      { name: "itemId",          label: "품목(캐니스터)", type: "id_ref", required: true, lookup: "search_items" },
      { name: "locationId",      label: "위치",          type: "id_ref", required: true, lookup: "list_locations" },
      { name: "aldMaterialName", label: "재료",          type: "text",   required: true },
      { name: "aldTareWeight",   label: "빈무게(g)",     type: "number", required: true, validation: "0보다 큼" },
      { name: "aldInitialGross", label: "총무게(g)",     type: "number", required: true,
        validation: "빈무게(aldTareWeight)보다 커야 함" },
      { name: "memo",            label: "비고",          type: "text",   required: false },
      { name: "barcodeId",       label: "바코드",        type: "barcode", required: true, auto: "system_generate" },
      { name: "txDate",          label: "입고일",        type: "date",   required: true, auto: "today" },
    ],
    steps: [
      { api: "POST /api/internal/barcodes",
        body: ["itemId", "aldTareWeight", "aldMaterialName", "aldInitialGross"], returns: "barcodeId" },
      { api: "POST /api/internal/inventory",
        body: ["txType=입고", "itemId", "qty=1", "locationId", "barcodeId", "memo", "txDate"] },
    ],
    cardTitle: "캐니스터 입고 확인",
    cardShow: ["itemId", "locationId", "aldMaterialName", "aldTareWeight", "aldInitialGross", "memo"],
  },
  {
    id: "inventory_inbound_target",
    label: "타겟 입고",
    description: "새 타겟을 입고한다. 바코드는 시스템이 자동 생성.",
    triggers: ["타겟 입고", "타겟 들어왔어"],
    appliesWhen: { categoryName: "타겟" },
    fields: [
      { name: "itemId",     label: "품목(타겟)", type: "id_ref", required: true, lookup: "search_items" },
      { name: "locationId", label: "위치",       type: "id_ref", required: true, lookup: "list_locations" },
      { name: "memo",       label: "비고",       type: "text",   required: false },
      { name: "barcodeId",  label: "바코드",     type: "barcode", required: true, auto: "system_generate" },
      { name: "txDate",     label: "입고일",     type: "date",   required: true, auto: "today" },
    ],
    steps: [
      { api: "POST /api/internal/barcodes", body: ["itemId"], returns: "barcodeId" },
      { api: "POST /api/internal/inventory",
        body: ["txType=입고", "itemId", "qty=1", "locationId", "barcodeId", "memo", "txDate"] },
    ],
    cardTitle: "타겟 입고 확인",
    cardShow: ["itemId", "locationId", "memo"],
  },
];
