const HANGUL_TO_ENG: Record<string, string> = {
  "ㅂ":"q","ㅈ":"w","ㄷ":"e","ㄱ":"r","ㅅ":"t","ㅛ":"y","ㅕ":"u","ㅑ":"i","ㅐ":"o","ㅔ":"p",
  "ㅁ":"a","ㄴ":"s","ㅇ":"d","ㄹ":"f","ㅎ":"g","ㅗ":"h","ㅓ":"j","ㅏ":"k","ㅣ":"l",
  "ㅋ":"z","ㅌ":"x","ㅊ":"c","ㅍ":"v","ㅠ":"b","ㅜ":"n","ㅡ":"m",
  "ㅃ":"Q","ㅉ":"W","ㄸ":"E","ㄲ":"R","ㅆ":"T","ㅒ":"O","ㅖ":"P",
  "ㄳ":"rt","ㄵ":"sw","ㄶ":"sg","ㄺ":"fr","ㄻ":"fa","ㄼ":"fq","ㄽ":"ft","ㄾ":"fx","ㄿ":"fv","ㅀ":"fg",
};

export function normalizeBarcodeInput(str: string): string {
  return str
    .split('')
    .map(ch => HANGUL_TO_ENG[ch] ?? ch)
    .filter(ch => !/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(ch))
    .join('')
    .toUpperCase();
}

/**
 * \uBC14\uCF54\uB4DC \uBCC0\uD615 \uD6C4\uBCF4 \uC0DD\uC131 (\uC61B\uB0A0 \uD55C \uC790\uB9AC ID \uBC14\uCF54\uB4DC \uAC80\uC0C9\uC6A9).
 *
 * \uB9C8\uC9C0\uB9C9 dash segment\uAC00 \uC22B\uC790\uB85C\uB9CC \uAD6C\uC131\uB41C \uACBD\uC6B0, 0 prefix \uCD94\uAC00/\uC81C\uAC70 \uBCC0\uD615\uC744
 * \uD568\uAED8 \uBC18\uD658\uD55C\uB2E4. \uC2E0\uADDC \uBC14\uCF54\uB4DC(\uD604\uC7AC \uD615\uC2DD)\uB294 0 padding\uC774 \uC5C6\uC73C\uBBC0\uB85C \uC601\uD5A5 \uC5C6\uC74C.
 *
 * \uC608\uC2DC:
 *   "T3ZNO0250-17-05" \u2192 ["T3ZNO0250-17-05", "T3ZNO0250-17-5"]
 *   "T3ZNO0250-17-5"  \u2192 ["T3ZNO0250-17-5", "T3ZNO0250-17-05"]
 *   "T-1"             \u2192 ["T-1", "T-01"]
 *   "T-005"           \u2192 ["T-005", "T-5"]
 *   "T-AB"            \u2192 ["T-AB"]   (\uB9C8\uC9C0\uB9C9\uC774 \uC22B\uC790\uAC00 \uC544\uB2C8\uBA74 \uBCC0\uD615 \uC5C6\uC74C)
 *   ""                \u2192 []
 */
export function expandBarcodeVariants(code: string): string[] {
  const trimmed = code.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);

  const lastDashIdx = trimmed.lastIndexOf("-");
  if (lastDashIdx >= 0 && lastDashIdx < trimmed.length - 1) {
    const prefix = trimmed.slice(0, lastDashIdx + 1);
    const suffix = trimmed.slice(lastDashIdx + 1);

    if (/^\d+$/.test(suffix)) {
      // 0 prefix \uC81C\uAC70: "05" \u2192 "5", "005" \u2192 "5"
      const stripped = suffix.replace(/^0+/, "") || "0";
      if (stripped !== suffix) {
        variants.add(prefix + stripped);
      }
      // \uD55C \uC790\uB9AC \u2192 \uB450 \uC790\uB9AC 0 padding \uCD94\uAC00: "5" \u2192 "05"
      if (suffix.length === 1) {
        variants.add(prefix + "0" + suffix);
      }
    }
  }

  return Array.from(variants);
}
