"use client";
import { useEffect, useRef, useState } from "react";
import { X, CameraOff } from "lucide-react";

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeCameraScanner({ onDetected, onClose }: Props) {
  const scannerRef = useRef<any>(null);
  const isRunningRef = useRef(false);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const divIdRef = useRef(`barcode-scanner-${Date.now()}`);

  useEffect(() => {
    mountedRef.current = true;
    const divId = divIdRef.current;

    const init = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

        // 이전 인스턴스 완전 정리
        const existingEl = document.getElementById(divId);
        if (existingEl) {
          // video 태그 명시적 정지 후 제거
          const videos = existingEl.querySelectorAll("video");
          videos.forEach(v => { v.srcObject = null; v.remove(); });
          existingEl.innerHTML = "";
        }

        const scanner = new Html5Qrcode(divId, { verbose: false } as any);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            videoConstraints: { facingMode: "environment" },
            formatsToSupport: [
              Html5QrcodeSupportedFormats.QR_CODE,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.DATA_MATRIX,
            ],
          } as any,
          (decodedText: string) => {
            if (mountedRef.current) onDetected(decodedText);
          },
          undefined
        );

        if (!mountedRef.current) {
          await scanner.stop().catch(() => {});
          return;
        }

        // 라이브러리가 추가로 생성한 중복 video 제거 (첫 번째만 유지)
        const el = document.getElementById(divId);
        if (el) {
          const videos = el.querySelectorAll("video");
          // 첫 번째 video만 유지, 나머지 제거
          for (let i = 1; i < videos.length; i++) {
            videos[i].srcObject = null;
            videos[i].remove();
          }
        }

        isRunningRef.current = true;
        setStarted(true);
      } catch (err: any) {
        if (!mountedRef.current) return;
        const msg = err?.message ?? String(err);
        // AbortError는 video play 타이밍 이슈로 기능에 영향 없음 — 무시
        if (msg.includes("AbortError") || msg.includes("interrupted by a new load")) return;
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          setError("카메라 권한이 거부되었습니다.\n브라우저 주소창 옆 카메라 아이콘을 클릭해 권한을 허용해주세요.");
        } else if (msg.includes("NotFoundError")) {
          setError("카메라를 찾을 수 없습니다.\n카메라 연결을 확인해주세요.");
        } else {
          setError("카메라를 시작할 수 없습니다.");
        }
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      const el = document.getElementById(divId);
      if (scannerRef.current && isRunningRef.current) {
        isRunningRef.current = false;
        scannerRef.current.stop()
          .catch(() => {})
          .finally(() => {
            if (el) {
              const videos = el.querySelectorAll("video");
              videos.forEach(v => { v.srcObject = null; v.remove(); });
              el.innerHTML = "";
            }
          });
      } else if (el) {
        const videos = el.querySelectorAll("video");
        videos.forEach(v => { v.srcObject = null; v.remove(); });
        el.innerHTML = "";
      }
    };
  }, []);

  if (error) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-sm">
          <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center gap-3 py-6 px-4">
            <CameraOff size={28} className="text-gray-400" />
            <p className="text-xs text-gray-500 text-center whitespace-pre-line leading-relaxed">{error}</p>
            <button onClick={onClose}
              className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-300">
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm">
        <div className="mt-2 rounded-xl border border-blue-200 overflow-hidden relative bg-black">
          <div
            id={divIdRef.current}
            className="w-full [&_button]:hidden [&_select]:hidden [&_img]:hidden [&_video:not(:first-of-type)]:hidden"
          />
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-10 p-1.5 bg-white/90 rounded-full shadow hover:bg-white">
            <X size={16} className="text-gray-700" />
          </button>
          {started && (
            <p className="absolute bottom-0 left-0 right-0 text-center text-xs text-white/80 py-1.5 bg-black/50">
              바코드를 사각형 안에 맞춰주세요
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
