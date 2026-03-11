"use client";

import { Package } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  desc: string;
}

export default function PlaceholderPage({ title, desc }: PlaceholderPageProps) {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
          <Package size={24} className="text-gray-400" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-1">{desc}</p>
        <p className="text-xs text-gray-400 mt-3">개발 예정</p>
      </div>
    </div>
  );
}
