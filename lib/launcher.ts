// 포털 런처 연동 헬퍼 — 메뉴 주소(?page=) 읽기·쓰기, 포털 사용 기록 전송.
// 모두 window 를 쓰므로 useEffect·이벤트 핸들러 안에서만 호출할 것.
import { DEFAULT_PAGE, isPageId, type PageId } from "@/lib/menus";

const PAGE_PARAM = "page";
const APP_KEY = "inventory";

/** 주소의 ?page= 값. 없거나 모르는 키면 null */
export function readPageParam(): PageId | null {
  const v = new URLSearchParams(window.location.search).get(PAGE_PARAM);
  return isPageId(v) ? v : null;
}

/** 주소의 page 파라미터를 현재 화면과 맞춘다 (기본 화면이면 삭제, 다른 파라미터는 유지) */
export function writePageParam(page: PageId): void {
  const url = new URL(window.location.href);
  if (page === DEFAULT_PAGE) url.searchParams.delete(PAGE_PARAM);
  else url.searchParams.set(PAGE_PARAM, page);
  const next = url.pathname + url.search + url.hash;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState(window.history.state, "", next);
}

/**
 * 포털에 메뉴 사용 1건 기록. 실패는 조용히 무시한다.
 * BasePathFetch 가 "/" 로 시작하는 주소에 basePath 를 붙이므로 반드시 origin 포함 절대 주소로 보낸다.
 */
export function sendLauncherUsage(page: PageId): void {
  try {
    const url = `${window.location.origin}/api/launcher/usage`;
    const body = JSON.stringify({ app: APP_KEY, page });
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      fetch(url, {
        method: "POST",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {});
    }
  } catch {
    // 기록 실패는 화면 동작에 영향 주지 않음
  }
}
