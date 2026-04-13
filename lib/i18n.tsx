"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ko, type Messages } from "@/messages/ko";
import { en } from "@/messages/en";

type Lang = "ko" | "en";

const messages: Record<Lang, Messages> = { ko, en };

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Messages;
}

const LangContext = createContext<LangContextType>({
  lang: "ko",
  setLang: () => {},
  t: ko,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ko");

  useEffect(() => {
    const saved = localStorage.getItem("lang") as Lang | null;
    if (saved === "ko" || saved === "en") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  };

  return (
    <LangContext.Provider value={{ lang, setLang, t: messages[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useT() {
  return useContext(LangContext);
}
