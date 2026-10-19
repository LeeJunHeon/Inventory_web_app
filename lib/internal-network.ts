/**
 * 사내망 요청 판별 — X-Client-IP 헤더 기준.
 *
 * - Caddy(vanam-caddy)가 검증한 실제 접속 IP를 모든 요청에 X-Client-IP 로 넣는다
 *   (외부에서 같은 이름으로 보낸 헤더는 덮어쓰고, X-Forwarded-For 위조도 막는다).
 *   그래서 이 헤더는 Caddy 를 거친 요청에서만 믿을 수 있다.
 * - NAS 포트(3000)로 직접 들어오는 요청은 헤더를 스스로 넣을 수 있지만,
 *   그 포트는 사내망에서만 열려 있어 허용 범위와 같다.
 * - 사내 PC는 공유기 NAT 루프백 때문에 192.168.0.1 로 찍힌다.
 * - proxy.ts(Edge)에서도 쓰므로 Node 전용 API 없이 문자열·숫자 연산만 쓴다.
 * - 헤더가 없거나 값이 이상하면 항상 false(막는 쪽).
 */

export const DEFAULT_INTERNAL_CLIENT_CIDRS = ["192.168.0.0/24"];

/** "a.b.c.d" → 32비트 부호 없는 정수, 형식이 아니면 null */
function parseIPv4(s: string): number | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** "a.b.c.d/len" → { base, mask }, 형식이 아니면 null */
function parseCidr(s: string): { base: number; mask: number } | null {
  const [ip, len, ...rest] = s.trim().split("/");
  if (rest.length > 0 || len === undefined || !/^\d{1,2}$/.test(len)) return null;
  const bits = Number(len);
  if (bits > 32) return null;
  const addr = parseIPv4(ip);
  if (addr === null) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (addr & mask) >>> 0, mask };
}

function allowedCidrs(): { base: number; mask: number }[] {
  const env = process.env.INTERNAL_CLIENT_CIDRS;
  const list = env && env.trim() ? env.split(",") : DEFAULT_INTERNAL_CLIENT_CIDRS;
  return list.map(parseCidr).filter((c): c is { base: number; mask: number } => c !== null);
}

/** X-Client-IP 가 허용 대역(INTERNAL_CLIENT_CIDRS, 기본 192.168.0.0/24)이면 true */
export function isInternalClient(headers: Headers): boolean {
  let ip = headers.get("x-client-ip")?.trim() ?? "";
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  if (!ip || ip.includes(",")) return false;
  const addr = parseIPv4(ip);
  if (addr === null) return false;
  return allowedCidrs().some(({ base, mask }) => ((addr & mask) >>> 0) === base);
}
