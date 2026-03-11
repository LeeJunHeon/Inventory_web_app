import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "재고관리 시스템",
  description: "통합 재고관리 웹앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body style={{ fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
