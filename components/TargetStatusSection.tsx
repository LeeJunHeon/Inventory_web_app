"use client";

import { Loader2 } from "lucide-react";
import { TARGET_STATUS_LABELS } from "@/lib/data";

export interface TargetItem {
  id: number;
  status: string;
  barcodeCode: string;
  itemCode: string;
  itemName: string;
  latestWeight: number | null;
  latestLoggedAt: string | null;
  locationName: string | null;
  inboundDate: string | null;
  purity: number | null;
  hasCopper: string | null;
  copperThickness: number | null;
  siteLocationId?: number;
  // ALD Canister 전용
  materialName?: string | null;
  tareWeight?: number | null;
  initialGrossWeight?: number | null;
}

interface TargetStatusSectionProps {
  items: TargetItem[];
  loading?: boolean;
  error?: string;
  variant?: "target" | "ald";
}

/**
 * 개체(target_unit) 단위 보유현황 표. 프레젠테이션 전용 —
 * 데이터 조회·검색·상태 필터는 상위(StatusPage)의 통합 필터가 담당한다.
 */
export default function TargetStatusSection({
  items,
  loading = false,
  error = "",
  variant = "target",
}: TargetStatusSectionProps) {
  const isAld = variant === "ald";

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-12 flex items-center justify-center gap-2 text-gray-400">
        <Loader2 size={18} className="animate-spin" /><span className="text-sm">로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-12 text-center text-sm text-rose-500">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            isAld ? "bg-indigo-100 text-indigo-700" : "bg-sky-100 text-sky-700"
          }`}>
            {isAld ? "ALD Canister" : "타겟"}
          </span>
          <span className="text-xs text-gray-400">{items.length}개</span>
        </div>
      </div>

      {/* 테이블 */}
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          검색 결과가 없습니다
        </div>
      ) : (
        <>
          {/* 데스크탑 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">바코드</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">품목명</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">상태</th>
                  {isAld && (
                    <>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">물질명</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">공병무게</th>
                    </>
                  )}
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">현재 무게</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">마지막 측정일</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">현재 위치</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">입고일</th>
                  {!isAld && (
                    <>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">순도</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">Copper</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-2.5">Cu 두께</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const badge = TARGET_STATUS_LABELS[t.status] || { label: t.status, color: "bg-gray-100 text-gray-500" };
                  return (
                    <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono text-gray-600">{t.barcodeCode || "-"}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{t.itemName}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                      </td>
                      {isAld && (
                        <>
                          <td className="px-5 py-3 text-sm text-gray-600">{t.materialName || "-"}</td>
                          <td className="px-5 py-3 text-sm text-gray-600">
                            {t.tareWeight != null ? `${t.tareWeight.toFixed(3)}g` : "-"}
                          </td>
                        </>
                      )}
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {t.latestWeight != null ? `${t.latestWeight.toFixed(3)}g` : "미측정"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {t.latestLoggedAt ? t.latestLoggedAt.replace("T", " ").slice(0, 16) : "-"}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{t.locationName || "-"}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">{t.inboundDate || "-"}</td>
                      {!isAld && (
                        <>
                          <td className="px-5 py-3 text-sm text-gray-600">{t.purity != null ? `${t.purity}%` : "-"}</td>
                          <td className="px-5 py-3 text-sm text-gray-600">{t.hasCopper === "Y" ? "있음" : t.hasCopper === "N" ? "없음" : "-"}</td>
                          <td className="px-5 py-3 text-sm text-gray-600">{t.copperThickness != null ? `${t.copperThickness}"` : "-"}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일 */}
          <div className="md:hidden divide-y divide-gray-50">
            {items.map((t) => {
              const badge = TARGET_STATUS_LABELS[t.status] || { label: t.status, color: "bg-gray-100 text-gray-500" };
              return (
                <div key={t.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-900">{t.itemName}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span className="font-mono">{t.barcodeCode || "-"}</span>
                    {isAld && <span>{t.materialName || "-"}</span>}
                    {isAld && <span>{t.tareWeight != null ? `공병 ${t.tareWeight.toFixed(3)}g` : "-"}</span>}
                    <span>{t.latestWeight != null ? `${t.latestWeight.toFixed(3)}g` : "미측정"}</span>
                    <span>{t.locationName || "-"}</span>
                    <span>{t.inboundDate || "-"}</span>
                    {!isAld && <span>{t.purity != null ? `순도 ${t.purity}%` : "-"}</span>}
                    {!isAld && <span>{t.hasCopper === "Y" ? "Cu 있음" : t.hasCopper === "N" ? "Cu 없음" : "-"}</span>}
                    {!isAld && <span>{t.copperThickness != null ? `Cu두께 ${t.copperThickness}"` : "-"}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
