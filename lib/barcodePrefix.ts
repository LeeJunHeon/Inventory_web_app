// 카테고리별 바코드 prefix 매핑 (공용 상수)
// ⚠️ 실제 DB 카테고리명은 "기자재/소모품" 이므로 "기자재"와 함께 둘 다 매핑해야 함.
export const CATEGORY_PREFIX: Record<string, string> = {
  "타겟": "T",
  "웨이퍼": "W",
  "가스": "G",
  "기자재": "E",
  "기자재/소모품": "E",   // ← 실제 DB 카테고리명 매핑
  "ALD Canister": "C",
};

// 카테고리명으로 prefix 결정 (매핑 없으면 첫 글자 대문자 fallback)
export function barcodePrefixFor(categoryName: string): string {
  return CATEGORY_PREFIX[categoryName] ?? categoryName.charAt(0).toUpperCase();
}
