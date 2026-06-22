"use client";
import { SessionProvider } from "next-auth/react";
import { LanguageProvider } from "@/lib/i18n";
import BasePathFetch from "@/components/BasePathFetch";

export default function Providers({ children }: { children: React.ReactNode }) {
  const bp = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return (
    <SessionProvider basePath={`${bp}/api/auth`}>
      <BasePathFetch />
      <LanguageProvider>
        {children}
      </LanguageProvider>
    </SessionProvider>
  );
}
