"use client";
import { Download } from "lucide-react";

interface CsvButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

export default function CsvButton({ onClick, disabled = false, label = "CSV" }: CsvButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download size={15} />
      {label}
    </button>
  );
}
