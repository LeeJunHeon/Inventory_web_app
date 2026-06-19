"use client";
import { SessionProvider } from "next-auth/react";
import { LanguageProvider } from "@/lib/i18n";
import BasePathFetch from "@/components/BasePathFetch";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BasePathFetch />
      <LanguageProvider>
        {children}
      </LanguageProvider>
    </SessionProvider>
  );
}
