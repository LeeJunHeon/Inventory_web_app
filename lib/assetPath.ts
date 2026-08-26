// 이미지 src 등 fetch 가 아닌 경로는 BasePathFetch(components/BasePathFetch.tsx)의
// window.fetch 패치가 보정해주지 않는다. <img src> 처럼 브라우저가 직접 받아오는
// 절대경로는 이 헬퍼로 basePath 를 붙여준다.
const BP = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function assetPath(path: string): string {
  if (!BP) return path;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (path === BP || path.startsWith(BP + "/")) return path;
  return BP + path;
}
