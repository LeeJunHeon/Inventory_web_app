// 거래 유형 상수 — 서버/클라이언트 공용.
//
// lib/txTypes.ts 는 prisma 를 import 하므로 클라이언트 컴포넌트에서 끌어올 수 없다.
// 화면(입출고 부호·합계)도 서버 집계와 같은 기준으로 판정해야 하므로,
// 값이 두 벌로 갈라지지 않게 상수만 이 파일로 분리하고 txTypes 는 이를 재수출한다.

// ── 위치 간 재고 이동 ──────────────────────────────────
// 사용자는 '이동' 하나로 요청하지만 DB에는 전표 2장이 쌍으로 남는다.
// (이동출고=출발지 차감, 이동입고=도착지 가산) 행 하나가 정확히 한 위치에만
// 영향을 줘야 위치별 txType 합산 구조의 기존 집계가 그대로 동작하기 때문이다.
// DB에 "이동"이라는 txType은 존재하지 않는다 — POST 요청의 별칭일 뿐이다.
export const MOVE_OUT = "이동출고";
export const MOVE_IN  = "이동입고";

/** 위치별 보유수량에 가산되는 유형 */
export const STOCK_PLUS_TYPES = ["입고", MOVE_IN];

/** 보유수량에서 항상 차감되는 유형 (폐기는 getStockMinusDisposals로 별도 분류) */
export const STOCK_MINUS_TYPES = ["출고", "불출", "사용중", MOVE_OUT];

/** 입고건 잔여수량을 점유하는 유형 (refTxNo=입고건 필터와 함께 사용) */
export const LOT_CONSUME_TYPES = ["출고", "불출", "사용중", "폐기", MOVE_OUT];
