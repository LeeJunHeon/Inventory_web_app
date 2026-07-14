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
    description: "일반 품목(가스/소모품 등)을 입고한다. 웨이퍼·타겟·ALD Canister는 별도 작업.",
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
        validation: "바코드가 있는 품목(웨이퍼/타겟/캐니스터)은 사용자가 바코드(예: C-30, T-35)를 직접 말하거나 품목명으로 목록을 보고 고른다. 바코드를 lookup_barcode로 조회하면 itemId와 refTxNo를 함께 반환하므로 그 값을 쓴다. 단 lookup_barcode 응답의 ambiguous가 true이면 refTxNo가 null이다(이 바코드에 입고건이 여러 개 연결됨). 이 경우 절대 임의로 정하지 말고, list_inbound_lots로 잔여 있는 입고건을 보여주고 사용자에게 어느 입고분에서 출고할지 반드시 물어본다. 가스/소모품 등 바코드 없는 품목은 비워둔다." },
      { name: "refTxNo", label: "출고할 입고분", type: "text", required: true, lookup: "list_inbound_lots",
        validation: "바코드 품목이면 lookup_barcode가 반환한 refTxNo를 그대로 쓴다. 단 lookup_barcode 응답의 ambiguous가 true이면 refTxNo가 null이다. 이 경우 절대 임의로 정하지 말고, list_inbound_lots로 잔여 있는 입고건을 보여주고 사용자에게 어느 입고분에서 출고할지 반드시 물어본다. 바코드 없는 품목이면 list_inbound_lots로 잔여있는 입고건을 보여주고 사용자가 고른 전표번호(txNo)를 쓴다." },
      { name: "qty", label: "수량", type: "number", required: true,
        validation: "1 이상, 고른 입고분 잔여수량 이내. 타겟·캐니스터는 항상 1." },
      { name: "locationId", label: "위치", type: "id_ref", required: false, lookup: "list_locations",
        validation: "참조 입고분의 위치와 일치해야 함. 바코드 품목이면 보통 묻지 않아도 된다." },
      { name: "txType", label: "유형", type: "enum", required: true,
        enumValues: ["출고", "불출"],
        validation: "사용자의 말에 '출고'라는 단어가 있으면 즉시 '출고'를, '불출'이라는 단어가 있으면 즉시 '불출'을 이 필드에 넣는다. 이 경우 절대 되묻지 마라(사용자가 이미 명확히 말한 것이다). 사용자가 '출고'나 '불출' 둘 다 말하지 않고 '빼줘', '내보내줘'처럼 애매하게만 말한 경우에만, 마음대로 정하지 말고 '출고인가요, 불출인가요?'라고 한 번 되물어 확인한다. 요약: 단어가 있으면 바로 채우고 되묻지 않는다 / 단어가 없을 때만 되묻는다." },
      { name: "disburseeUserId", label: "불출처", type: "id_ref", required: false, lookup: "search_users",
        validation: "불출(txType=불출)일 때만 사용한다. 불출처는 그 재고를 사용하는(가져가는) 사람이다. 사용자가 불출처를 사람 이름으로 말하면 search_users로 조회한다. 묻는다면 '불출처를 알려주세요'처럼 물어라(절대 '누구에게 불출하는지'라고 묻지 마라). 출고(txType=출고)일 때는 사용하지 않고 비워둔다. 사용자가 불출처를 말하지 않으면 비워둔다(선택 항목이므로 굳이 캐묻지 않아도 된다)." },
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
  {
    id: "inventory_inbound_wafer",
    label: "웨이퍼 입고",
    description: "웨이퍼를 입고한다. 입고 로트 바코드(W-xxx)는 시스템이 자동 생성한다.",
    triggers: ["웨이퍼 입고", "웨이퍼 들어왔어"],
    appliesWhen: { categoryName: "웨이퍼" },
    fields: [
      { name: "itemId",     label: "품목(웨이퍼)", type: "id_ref", required: true,  lookup: "search_items" },
      { name: "qty",        label: "수량",         type: "number", required: true,  validation: "1 이상 정수 (웨이퍼는 여러 장 입고 가능)" },
      { name: "locationId", label: "위치",         type: "id_ref", required: true,  lookup: "list_locations" },
      { name: "partnerId",  label: "거래처",       type: "id_ref", required: false, lookup: "search_partners" },
      { name: "currency",   label: "통화",         type: "enum",   required: false, enumValues: ["KRW", "USD"],
        validation: "KRW 또는 USD. 사용자가 달러라고 하면 USD, 원이라고 하거나 통화를 말하지 않으면 KRW(기본)." },
      { name: "unitPrice",  label: "단가",         type: "number", required: false },
      { name: "memo",       label: "비고",         type: "text",   required: false },
      { name: "barcodeId",  label: "바코드",       type: "barcode", required: true, auto: "system_generate" },
      { name: "txDate",     label: "입고일",       type: "date",   required: true, auto: "today" },
    ],
    steps: [
      { api: "POST /api/internal/barcodes", body: ["itemId"], returns: "barcodeId" },
      { api: "POST /api/internal/inventory",
        body: ["txType=입고", "itemId", "qty", "locationId", "unitPrice", "currency", "partnerId", "barcodeId", "memo", "txDate"] },
    ],
    cardTitle: "웨이퍼 입고 확인",
    cardShow: ["itemId", "qty", "locationId", "unitPrice", "currency", "partnerId", "memo"],
  },
  {
    id: "target_measure",
    label: "타겟 사용현황(측정)",
    description: "스퍼터 타겟을 챔버에 장착하거나 무게를 측정해 사용현황을 기록한다. 바코드(T-xxx)로 타겟을 식별한다. 타겟이 처음 사용되면 자동으로 '사용중'이 되고, 챔버 슬롯도 자동 갱신된다. (ALD 캐니스터는 이 작업이 아니라 별도의 '캐니스터 측정' 작업을 쓴다.)",
    triggers: ["타겟 측정", "타겟 장착", "챔버에 장착", "타겟 사용현황", "타겟 무게"],
    appliesWhen: { categoryName: "타겟" },
    fields: [
      { name: "barcodeId", label: "바코드", type: "barcode", required: true, lookup: "lookup_barcode",
        validation: "사용자가 말한 타겟 바코드(예: T-36)를 그대로 쓴다. 바코드는 타겟을 식별하는 필수값이다. 바코드 없이는 진행할 수 없으니, 사용자가 바코드를 말하지 않으면 '타겟 바코드를 알려주세요'라고 묻는다." },
      { name: "weight", label: "무게(g)", type: "number", required: false,
        validation: "타겟의 측정 무게(그램). 측정 작업의 핵심 값이므로 사용자가 무게를 말하지 않았으면 '측정한 무게(g)를 알려주세요'라고 반드시 묻는다. 단, 사용자가 '무게 없이 챔버에 장착만 한다' 또는 '보관함에서 챔버로 옮기기만 한다'고 명확히 말한 경우에는 무게를 비워두고 진행해도 된다(이 경우 시스템이 허용 여부를 판단한다)." },
      { name: "locationId", label: "위치", type: "id_ref", required: false, lookup: "list_locations",
        validation: "타겟이 측정/장착되는 위치다. 챔버(예: 'Chamber 1 - Gun 1', 'Chamber 2 - Gun 1/2/3', 'Chamber K - Gun 1/2') 또는 보관함(예: 'Vault', 'Desicator 1')을 list_locations 목록에서 고른다. 중요: 챔버는 Gun(건) 단위로 나뉜다. 사용자가 'Chamber 2'처럼 챔버만 말하고 Gun을 말하지 않으면, list_locations 목록을 보고 'Chamber 2의 어느 Gun인가요? (Gun 1/2/3)'처럼 어느 Gun인지 반드시 되물어 정확한 위치를 확정한다. 위치를 말하지 않으면 '어느 위치(챔버/보관함)인가요?'라고 묻는다." },
      { name: "reason", label: "사유", type: "text", required: false,
        validation: "측정/장착 사유. 사용자가 말하면 적고, 안 말하면 비워둔다(선택)." },
    ],
    steps: [
      { api: "POST /api/internal/target-log",
        body: ["barcodeId", "weight", "locationId", "reason"] },
    ],
    cardTitle: "타겟 측정 확인",
    cardShow: ["barcodeId", "weight", "locationId", "reason"],
  },
  {
    id: "ald_measure",
    label: "캐니스터 사용현황(측정)",
    description: "ALD 캐니스터의 무게를 측정해 사용현황(잔량)을 기록한다. 바코드(C-xxx)로 캐니스터를 식별한다. 측정무게를 기록하면 시스템이 잔량%와 예상 잔여 사이클을 자동 계산한다. (스퍼터 타겟은 이 작업이 아니라 별도의 '타겟 측정' 작업을 쓴다.)",
    triggers: ["캐니스터 측정", "캐니스터 무게", "캐니스터 사용현황", "ALD 측정"],
    appliesWhen: { categoryName: "ALD Canister" },
    fields: [
      { name: "barcodeId", label: "바코드", type: "barcode", required: true, lookup: "lookup_barcode",
        validation: "사용자가 말한 캐니스터 바코드(예: C-32)를 그대로 쓴다. 바코드는 캐니스터를 식별하는 필수값이다. 사용자가 바코드를 말하지 않으면 '캐니스터 바코드를 알려주세요'라고 묻는다." },
      { name: "measureWeight", label: "측정무게(g)", type: "number", required: false,
        validation: "캐니스터의 현재 측정 무게(그램). 측정 작업의 핵심 값이므로 사용자가 측정무게를 말하지 않았으면 '측정한 무게(g)를 알려주세요'라고 반드시 묻는다." },
      { name: "cumulativeCycle", label: "누적 사이클", type: "number", required: false,
        validation: "지금까지의 누적 공정 사이클 수. 사용자가 말하면 적는다. 안 말하면 비워둔다(선택). 이 값이 있으면 시스템이 예상 잔여 사이클을 계산한다." },
      { name: "locationId", label: "위치", type: "id_ref", required: false, lookup: "list_locations",
        validation: "캐니스터가 측정/장착되는 위치다. 사용자가 위치를 말하면 list_locations 목록에서 고른다. 안 말하면 비워둔다(선택)." },
      { name: "reason", label: "사유", type: "text", required: false,
        validation: "측정 사유. 사용자가 말하면 적고, 안 말하면 비워둔다(선택)." },
    ],
    steps: [
      { api: "POST /api/internal/ald-log",
        body: ["barcodeId", "measureWeight", "cumulativeCycle", "locationId", "reason"] },
    ],
    cardTitle: "캐니스터 측정 확인",
    cardShow: ["barcodeId", "measureWeight", "cumulativeCycle", "locationId", "reason"],
  },
];
