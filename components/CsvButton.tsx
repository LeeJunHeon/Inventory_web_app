"use client";
import { Download } from "lucide-react";

interface CsvButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
}

export default function CsvButton({ onClick, disabled = false, label = "Excel", size = "md" }: CsvButtonProps) {
  const isSm = size === "sm";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={isSm
        ? "flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        : "flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"}
    >
      <Download size={isSm ? 13 : 15} />
      {label}
    </button>
  );
}
