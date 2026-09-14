"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Image as ImageIcon, Loader2, ChevronDown, Upload } from "lucide-react";
import { useT } from "@/lib/i18n";
import { assetPath } from "@/lib/assetPath";
import { TargetPhoto } from "@/lib/targetPhotoTypes";
import TargetPhotoUploadModal from "@/components/TargetPhotoUploadModal";

interface Props {
  onOpenPhoto: (list: TargetPhoto[], idx: number, onDeleted: (id: number) => void) => void;
  refreshKey?: number;   // 다음 작업(업로드 모달)에서 재조회 트리거로 쓴다
}

interface Facets {
  materials: { code: string; count: number }[];
  inches:    { inch: number; count: number }[];
  tags:      { tag: string; count: number }[];
  statuses:  { status: string; count: number }[];
}

const PAGE_LIMIT = 60;
const EMPTY_FILTERS = { material: "", inch: "", tag: "", status: "", from: "", to: "" };
type Filters = typeof EMPTY_FILTERS;

const INPUT_CLS = "px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500";

export default function TargetPhotoGallery({ onOpenPhoto, refreshKey }: Props) {
  const { t } = useT();
  const [filters, setFilters]         = useState<Filters>(EMPTY_FILTERS);
  const [facets, setFacets]           = useState<Facets | null>(null);
  const [items, setItems]             = useState<TargetPhoto[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showUpload, setShowUpload]   = useState(false);
  const [reloadTick, setReloadTick]   = useState(0);

  // 값이 있는 필터만 파라미터로 붙인다. fetch 는 상대경로 (BasePathFetch 가 보정)
  const buildUrl = useCallback((p: number) => {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT), page: String(p) });
    if (filters.material) params.set("material", filters.material);
    if (filters.inch)     params.set("inch", filters.inch);
    if (filters.tag)      params.set("tag", filters.tag);
    if (filters.status)   params.set("matchStatus", filters.status);
    if (filters.from)     params.set("from", filters.from);
    if (filters.to)       params.set("to", filters.to);
    return `/api/target-photos?${params}`;
  }, [filters]);

  // 마운트 / 필터 변경 / refreshKey 변경 → 1페이지부터 교체
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(buildUrl(1))
      .then(r => r.ok ? r.json() : { photos: [], total: 0 })
      .then(data => {
        if (cancelled) return;
        setItems(data.photos || []);
        setTotal(data.total || 0);
        setPage(1);
      })
      .catch(() => { if (!cancelled) { setItems([]); setTotal(0); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [buildUrl, refreshKey, reloadTick]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/target-photos/facets")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data) setFacets(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey, reloadTick]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(page + 1));
      if (!res.ok) return;
      const data = await res.json();
      setItems(prev => [...prev, ...(data.photos || [])]);
      setTotal(data.total || 0);
      setPage(p => p + 1);
    } catch {
      // 무시 — 버튼을 다시 누르면 재시도
    } finally {
      setLoadingMore(false);
    }
  };

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  const tagLabel = (tag: string) =>
    tag === "before_sanding" ? t.target.photoTagBefore
    : tag === "after_sanding" ? t.target.photoTagAfter
    : tag;
  const statusLabel = (status: string) =>
    status === "confirmed" ? t.target.galleryStatusConfirmed
    : status === "candidate" ? t.target.photoCandidate
    : status === "unmatched" ? t.target.photoUnmatched
    : status;

  // TargetUsagePage 의 photoGroups 와 같은 로직 (날짜 desc, 날짜 없음은 맨 뒤).
  // items 의 원래 인덱스를 보존해 라이트박스 좌우 이동이 맞게 한다.
  const groups = useMemo(() => {
    const map = new Map<string, { photo: TargetPhoto; idx: number }[]>();
    items.forEach((p, idx) => {
      const key = p.takenDate ? String(p.takenDate).slice(0, 10) : "";
      const arr = map.get(key);
      if (arr) arr.push({ photo: p, idx });
      else map.set(key, [{ photo: p, idx }]);
    });
    return [...map.entries()]
      .map(([date, list]) => ({ date, items: list }))
      .sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date.localeCompare(a.date);
      });
  }, [items]);

  const handleDeleted = (id: number) => {
    setItems(prev => prev.filter(p => p.id !== id));
    setTotal(prev => Math.max(0, prev - 1));
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon size={16} className="text-blue-500" />
        <span className="text-sm font-bold text-gray-800">{t.target.galleryTitle}</span>
        <span className="text-xs text-gray-400">({total}{t.target.photoCountUnit})</span>
        <button
          onClick={() => setShowUpload(true)}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition"
        >
          <Upload size={14} /> {t.target.galleryUploadBtn}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filters.material} onChange={e => setFilter("material", e.target.value)} className={INPUT_CLS} aria-label={t.target.galleryFilterMaterial}>
          <option value="">{t.target.galleryFilterMaterial}: {t.target.galleryFilterAll}</option>
          {facets?.materials.map(m => (
            <option key={m.code} value={m.code}>{m.code} ({m.count})</option>
          ))}
        </select>
        <select value={filters.inch} onChange={e => setFilter("inch", e.target.value)} className={INPUT_CLS} aria-label={t.target.galleryFilterInch}>
          <option value="">{t.target.galleryFilterInch}: {t.target.galleryFilterAll}</option>
          {facets?.inches.map(i => (
            <option key={i.inch} value={String(i.inch)}>{i.inch}&quot; ({i.count})</option>
          ))}
        </select>
        <select value={filters.tag} onChange={e => setFilter("tag", e.target.value)} className={INPUT_CLS} aria-label={t.target.galleryFilterTag}>
          <option value="">{t.target.galleryFilterTag}: {t.target.galleryFilterAll}</option>
          {facets?.tags.map(x => (
            <option key={x.tag} value={x.tag}>{tagLabel(x.tag)} ({x.count})</option>
          ))}
        </select>
        <select value={filters.status} onChange={e => setFilter("status", e.target.value)} className={INPUT_CLS} aria-label={t.target.galleryFilterStatus}>
          <option value="">{t.target.galleryFilterStatus}: {t.target.galleryFilterAll}</option>
          {facets?.statuses.map(s => (
            <option key={s.status} value={s.status}>{statusLabel(s.status)} ({s.count})</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 shrink-0">{t.target.galleryFilterPeriod}</span>
          <input type="date" value={filters.from} onChange={e => setFilter("from", e.target.value)} className={INPUT_CLS} />
          <span className="text-xs text-gray-400">~</span>
          <input type="date" value={filters.to} onChange={e => setFilter("to", e.target.value)} className={INPUT_CLS} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">{t.target.galleryEmpty}</p>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.date || "__nodate"}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold text-gray-700">{group.date || "-"}</span>
                <span className="text-xs text-gray-400">{group.items.length}{t.target.photoCountUnit}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {group.items.map(({ photo: p, idx }) => {
                  const sizeLabel = [p.materialCode, p.diameterInch != null ? `${p.diameterInch}"` : null]
                    .filter(Boolean).join(" ");
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOpenPhoto(items, idx, handleDeleted)}
                      className="relative aspect-square overflow-hidden rounded-xl bg-gray-100 border border-gray-100 hover:ring-2 hover:ring-blue-400 transition"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={assetPath(`/api/target-photos/${p.id}?thumb=1`)}
                        alt={p.fileName}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1 p-1">
                        {sizeLabel && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-900/70 text-white">
                            {sizeLabel}
                          </span>
                        )}
                        {p.tag && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-500/90 text-white">
                            {tagLabel(p.tag)}
                          </span>
                        )}
                        {p.matchStatus === "candidate" && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/90 text-white">
                            {t.target.photoCandidate}
                          </span>
                        )}
                        {p.matchStatus === "unmatched" && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-500/80 text-white">
                            {t.target.photoUnmatched}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {items.length < total && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full mt-2 py-2.5 rounded-xl border border-dashed border-gray-200 text-xs font-semibold text-gray-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-60 flex items-center justify-center gap-1"
            >
              {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
              {t.target.galleryLoadMore(items.length, total)}
            </button>
          )}
        </div>
      )}

      {showUpload && (
        <TargetPhotoUploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => setReloadTick(t => t + 1)}
        />
      )}
    </div>
  );
}
