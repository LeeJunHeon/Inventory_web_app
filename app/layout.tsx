import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Script from "next/script";

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
        <Script
          id="suppress-abort-error"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('unhandledrejection', function(e) {
                var msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason || '');
                var name = (e.reason && e.reason.name) ? e.reason.name : '';
                if (name === 'AbortError' || msg.indexOf('interrupted by a new load') !== -1) {
                  e.preventDefault();
                  e.stopImmediatePropagation && e.stopImmediatePropagation();
                }
              }, true);
            `,
          }}
          />
      </head>
      <body style={{ fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
