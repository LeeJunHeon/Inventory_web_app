import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "standalone",
  // sharp는 네이티브 모듈 — 번들하지 않고 런타임 require로 두어야
  // standalone 빌드가 @img/sharp-* 바이너리를 함께 추적한다
  serverExternalPackages: ["sharp"],
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
