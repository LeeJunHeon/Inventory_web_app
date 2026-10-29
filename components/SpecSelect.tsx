"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

const CUSTOM = "__custom__";

interface SpecSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  invalid?: boolean;
}

/**
 * 드롭다운 + 직접 입력.
 * 현재 값이 선택지에 없고 비어 있지 않으면 자동으로 직접 입력 모드가 된다.
 */
export default function SpecSelect({ value, onChange, options, placeholder, invalid }: SpecSelectProps) {
  const { t } = useT();
  const [manual, setManual] = useState(false);
  const custom = manual || (value !== "" && !options.includes(value));

  const cls = `w-full px-3 py-2.5 border rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400 ${
    invalid ? "border-rose-400" : "border-blue-200"
  }`;

  if (custom) {
    return (
      <div className="flex gap-1.5">
        <input value={value} onChange={e => onChange(e.target.value)} maxLength={100}
          placeholder={t.items.specCustomPlaceholder} autoFocus={manual}
          className={`${cls} flex-1 min-w-0`} />
        <button type="button"
          onClick={() => { setManual(false); if (!options.includes(value)) onChange(""); }}
          className="shrink-0 px-2.5 py-2 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 whitespace-nowrap">
          {t.items.specPickFromList}
        </button>
      </div>
    );
  }

  return (
    <select value={value}
      onChange={e => {
        if (e.target.value === CUSTOM) { setManual(true); onChange(""); return; }
        onChange(e.target.value);
      }}
      className={cls}>
      <option value="">{placeholder ?? t.items.specSelectPlaceholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value={CUSTOM}>{t.items.specCustomInput}</option>
    </select>
  );
}
