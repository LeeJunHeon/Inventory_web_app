"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, X, Upload } from "lucide-react";
import { useT } from "@/lib/i18n";
import PhotoUploader from "@/components/ui/PhotoUploader";

interface Props {
  onClose: () => void;
  onUploaded: (count: number) => void;   // 1장 이상 성공 시 호출
}

interface Candidate { id: number; barcodeCode: string; itemName: string; status: string; }

// toISOString 은 UTC 라 새벽엔 어제가 된다 → 로컬 날짜로 만든다
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const SELECT_CLS = "px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500";
const INPUT_CLS  = "w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500";

export default function TargetPhotoUploadModal({ onClose, onUploaded }: Props) {
  const { t } = useT();
  const [searchType, setSearchType] = useState<"바코드" | "품목명">("품목명");
  const [query, setQuery]           = useState("");
  const [searching, setSearching]   = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected]     = useState<Candidate | null>(null);
  const [takenDate, setTakenDate]   = useState(todayLocal());
  const [tag, setTag]               = useState("");
  const [files, setFiles]           = useState<File[]>([]);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState("");

  // ESC 닫기 — 업로드 중엔 무시 (중간에 닫히면 일부만 올라간 채 남는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [uploading, onClose]);

  const handleClose = () => { if (!uploading) onClose(); };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setError("");
    setCandidates([]);
    setSelected(null);
    try {
      if (searchType === "바코드") {
        const res = await fetch(`/api/targets?barcode=${encodeURIComponent(q)}&limit=1`);
        const data = res.ok ? await res.json() : null;
        if (!data?.target) { setError(t.target.noResults); return; }
        const c: Candidate = {
          id: data.target.id, barcodeCode: data.target.barcodeCode,
          itemName: data.target.itemName, status: data.target.status,
        };
        setCandidates([c]);
        setSelected(c);
      } else {
        const res = await fetch(`/api/targets?itemName=${encodeURIComponent(q)}`);
        const data = res.ok ? await res.json() : null;
        const list: Candidate[] = Array.isArray(data?.targetList)
          ? data.targetList.map((tu: Candidate) => ({
              id: tu.id, barcodeCode: tu.barcodeCode, itemName: tu.itemName, status: tu.status,
            }))
          : [];
        if (list.length === 0) { setError(t.target.noResults); return; }
        setCandidates(list);
      }
    } catch {
      setError(t.target.noResults);
    } finally {
      setSearching(false);
    }
  };

  const canUpload = !!selected && files.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(takenDate) && !uploading;

  // 경로 B: targetUnitId + takenDate (targetLogId 는 보내지 않는다)
  const handleUpload = async () => {
    if (!selected) { setError(t.target.galleryUploadNeedTarget); return; }
    if (!canUpload) return;
    setUploading(true);
    setError("");
    let ok = 0, fail = 0;
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("targetUnitId", String(selected.id));
        fd.append("takenDate", takenDate);
        if (tag) fd.append("tag", tag);
        const res = await fetch("/api/target-photos", { method: "POST", body: fd });
        if (res.ok) ok++; else fail++;
      } catch {
        fail++;
      }
    }
    setUploading(false);
    if (ok > 0) onUploaded(ok);
    if (fail > 0) {
      setError(t.target.galleryUploadPartial(fail));
      return;
    }
    setFiles([]);
    setUploaderKey(k => k + 1);
    onClose();
  };

  const statusCls = (status: string) =>
    status === "미사용" ? "bg-emerald-100 text-emerald-700" :
    status === "사용중" ? "bg-blue-100 text-blue-700" :
    status === "판매완료" ? "bg-purple-100 text-purple-700" :
    "bg-gray-100 text-gray-500";
  const statusLabel = (status: string) =>
    status === "미사용" ? t.target.statusAvailable :
    status === "사용중" ? t.target.statusUsing :
    status === "판매완료" ? "판매완료" : t.target.statusDisposed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-800">{t.target.galleryUploadTitle}</h3>
          <button
            onClick={handleClose}
            disabled={uploading}
            aria-label={t.target.photoClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* ① 타겟 검색 */}
          <div>
            <p className="text-xs text-gray-500 mb-2">{t.target.galleryUploadSearchHint}</p>
            <div className="flex gap-2">
              <select
                value={searchType}
                onChange={e => setSearchType(e.target.value as "바코드" | "품목명")}
                className={`${SELECT_CLS} shrink-0`}
              >
                <option value="바코드">{t.target.searchTypeBarcode}</option>
                <option value="품목명">{t.target.searchTypeItemName}</option>
              </select>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
                className={INPUT_CLS}
                disabled={uploading}
              />
              <button
                onClick={handleSearch}
                disabled={searching || uploading || !query.trim()}
                className="px-3 py-2.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 shrink-0"
                aria-label={t.target.searchLabel}
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              </button>
            </div>
          </div>

          {/* ② 후보 목록 */}
          {candidates.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {candidates.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-sm transition ${
                    selected?.id === c.id ? "bg-blue-50 border-blue-300" : "border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <span className="font-mono text-xs text-gray-700 shrink-0">{c.barcodeCode}</span>
                  <span className="text-gray-800 truncate flex-1">{c.itemName}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusCls(c.status)}`}>
                    {statusLabel(c.status)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ③ 선택된 타겟 */}
          {selected && (
            <p className="text-sm text-gray-700">
              <span className="text-xs text-gray-400 mr-2">{t.target.galleryUploadSelected}</span>
              <span className="font-mono font-semibold">{selected.barcodeCode}</span>
              <span className="text-gray-400"> · </span>
              {selected.itemName}
            </p>
          )}

          {/* ④ 촬영일 + 태그 */}
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-500">
              {t.target.galleryUploadTakenDate}
              <input
                type="date"
                value={takenDate}
                onChange={e => setTakenDate(e.target.value)}
                disabled={uploading}
                className={SELECT_CLS}
              />
            </label>
            <select value={tag} onChange={e => setTag(e.target.value)} disabled={uploading} className={SELECT_CLS}>
              <option value="">{t.target.photoTagNone}</option>
              <option value="before_sanding">{t.target.photoTagBefore}</option>
              <option value="after_sanding">{t.target.photoTagAfter}</option>
            </select>
          </div>

          {/* ⑤ 파일 */}
          <PhotoUploader key={uploaderKey} onFilesChange={setFiles} maxFiles={10} disabled={uploading} />

          {/* ⑥ 에러 */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{error}</p>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-2">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={handleUpload}
            disabled={!canUpload}
            className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 inline-flex items-center justify-center gap-1"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {t.target.galleryUploadSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
