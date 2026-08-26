"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Camera, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * 사진 첨부 위젯 (equipment_web_app 의 components/ui/PhotoUploader.tsx 이식판).
 *
 * 원본과 다른 점: **업로드 전 클라이언트 리사이즈를 반드시 거친다.**
 * canvas 로 긴 변 2048px / JPEG q0.85 로 다시 인코딩해 부모에 넘긴다.
 *  - 업로드 시간 단축 + 리버스 프록시 413 회피
 *  - 아이폰 HEIC 는 사파리가 canvas 에 그려주므로 여기서 JPEG 로 떨어진다
 *    (서버 sharp 의 HEIC 디코딩 실패를 사전에 예방)
 * 변환에 실패하면 원본을 그대로 쓰되, 15MB 초과면 업로드 대상에서 제외한다.
 */

interface PhotoUploaderProps {
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

interface FileItem {
  file: File;      // 리사이즈 결과(실패 시 원본)
  preview: string;
  oversized: boolean;
}

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
/** lib/targetPhoto.ts 의 MAX_UPLOAD_BYTES 와 같은 값 */
const MAX_SIZE = 15 * 1024 * 1024;
const RESIZE_MAX_PX = 2048;
const RESIZE_QUALITY = 0.85;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isValidExt(f: File) {
  const ext = f.name.split(".").pop()?.toLowerCase() || "";
  return ALLOWED_EXT.has(ext);
}

/** 확장자를 .jpg 로 통일 (본문을 항상 JPEG 로 인코딩하므로) */
function toJpegName(name: string) {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.jpg`;
}

/**
 * canvas 로 긴 변 RESIZE_MAX_PX 이하 JPEG 로 재인코딩.
 * 실패하면 null 을 돌려주고 호출부가 원본을 쓴다.
 */
async function resizeImage(file: File): Promise<File | null> {
  try {
    // ⚠️ imageOrientation 을 반드시 명시한다.
    // canvas 로 재인코딩하는 순간 EXIF 가 사라져 서버의 sharp().rotate() 가
    // 무동작이 된다. 여기서 픽셀을 돌려놓지 않으면 세로 사진이 누운 채로 저장된다.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const w0 = bitmap.width;
    const h0 = bitmap.height;
    if (!w0 || !h0) { bitmap.close(); return null; }

    const scale = Math.min(1, RESIZE_MAX_PX / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    let blob: Blob | null = null;

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, w, h);
        blob = await canvas.convertToBlob({ type: "image/jpeg", quality: RESIZE_QUALITY });
      }
    }

    if (!blob) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { bitmap.close(); return null; }
      ctx.drawImage(bitmap, 0, 0, w, h);
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", RESIZE_QUALITY)
      );
    }

    bitmap.close();
    if (!blob) return null;

    return new File([blob], toJpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    // HEIC 를 디코딩하지 못하는 브라우저(안드로이드 크롬 등)가 여기로 온다
    return null;
  }
}

export default function PhotoUploader({
  onFilesChange,
  maxFiles = 10,
  disabled,
}: PhotoUploaderProps) {
  const { t } = useT();
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [warning, setWarning] = useState("");
  const [processing, setProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  // 언마운트 시 revoke 하려면 최신 items 가 필요하다 (cleanup 은 1회만 등록)
  const itemsRef = useRef<FileItem[]>([]);

  useEffect(() => {
    setIsMobile(
      navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent)
    );
  }, []);

  useEffect(() => {
    itemsRef.current = items;
    onFilesChange(items.filter((it) => !it.oversized).map((it) => it.file));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.preview));
    };
  }, []);

  const addFiles = useCallback(async (incoming: File[]) => {
    setWarning("");

    const extValid = incoming.filter(isValidExt);
    if (extValid.length < incoming.length) {
      setWarning(t.target.photoBadFormat);
    }
    if (extValid.length === 0) return;

    const room = maxFiles - itemsRef.current.length;
    if (room <= 0) {
      setWarning(t.target.photoMaxReached(maxFiles));
      return;
    }
    const accepted = extValid.slice(0, room);
    if (accepted.length < extValid.length) {
      setWarning(t.target.photoMaxReached(maxFiles));
    }

    setProcessing(true);
    try {
      const newItems: FileItem[] = [];
      for (const original of accepted) {
        const resized = await resizeImage(original);
        const file = resized ?? original;
        newItems.push({
          file,
          preview: URL.createObjectURL(file),
          // 변환에 실패한 원본만 크기 검사에 걸릴 수 있다
          oversized: file.size > MAX_SIZE,
        });
      }
      if (newItems.some((it) => it.oversized)) {
        setWarning(t.target.photoTooLarge);
      }
      setItems((prev) => [...prev, ...newItems]);
    } finally {
      setProcessing(false);
    }
  }, [maxFiles, t]);

  function removeFile(index: number) {
    setWarning("");
    setItems((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    void addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void addFiles(Array.from(e.dataTransfer.files));
    }
  }

  const full = items.length >= maxFiles;
  const blocked = !!disabled || processing || full;

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">
        <span className="inline-flex items-center gap-1">
          <Camera size={12} />
          {t.target.photoAttach}
          {items.length > 0 && ` (${items.length}/${maxFiles})`}
        </span>
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />

      {isMobile ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={blocked}
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-4 text-xs text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-40"
          >
            <Camera size={16} />
            {t.target.photoCamera}
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-4 text-xs text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-40"
          >
            <ImageIcon size={16} />
            {t.target.photoGallery}
          </button>
        </div>
      ) : (
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !blocked && fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 transition-colors
            ${dragging
              ? "border-blue-500 bg-blue-50 text-blue-600"
              : "border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300 hover:text-blue-500"}
            ${blocked ? "cursor-not-allowed opacity-40" : ""}`}
        >
          <Upload size={20} className="mb-1" />
          <p className="text-xs">{dragging ? t.target.photoDropHere : t.target.photoDropHint}</p>
          <p className="mt-0.5 text-[10px] text-gray-300">{t.target.photoFormatHint}</p>
        </div>
      )}

      {processing && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
          <Loader2 size={12} className="animate-spin" />
          {t.target.photoProcessing}
        </p>
      )}
      {warning && <p className="mt-1.5 text-xs text-amber-600">{warning}</p>}

      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((item, i) => (
            <div
              key={`${item.file.name}-${i}`}
              className={`relative overflow-hidden rounded-lg bg-gray-100 ${item.oversized ? "ring-2 ring-red-400" : ""}`}
              style={{ width: 72, height: 72 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.preview} alt={item.file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
              >
                <X size={10} />
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5 text-center">
                {item.oversized ? (
                  <span className="text-[9px] font-medium text-red-300">{t.target.photoOversized}</span>
                ) : (
                  <span className="text-[9px] text-white">{formatSize(item.file.size)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
