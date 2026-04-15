"use client";
import { useEffect, useRef, useState } from "react";
import { X, CameraOff, SwitchCamera } from "lucide-react";

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeCameraScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    setError(null);
    setStarted(false);

    const init = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 150,
        });

        if (!videoRef.current || !mountedRef.current) return;

        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result, err) => {
            if (result && mountedRef.current) {
              onDetected(result.getText());
            }
          }
        );

        if (!mountedRef.current) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setStarted(true);
        setSwitching(false);
      } catch (err: any) {
        if (!mountedRef.current) return;
        setSwitching(false);
        const msg = err?.message ?? String(err);
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
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchCamera = async () => {
    if (!started) return;
    setSwitching(true);
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  };

  if (error) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-sm">
          <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center gap-3 py-6 px-4">
            <CameraOff size={28} className="text-gray-400" />
            <p className="text-xs text-gray-500 text-center whitespace-pre-line leading-relaxed">{error}</p>
            <button onClick={onClose} className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-300">
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
          <video
            ref={videoRef}
            className="w-full"
            playsInline
            muted
            autoPlay
          />
          <button
            onClick={switchCamera}
            disabled={switching || !started}
            className="absolute top-2 left-2 z-10 p-1.5 bg-white/90 rounded-full shadow hover:bg-white disabled:opacity-40"
            title={facingMode === "environment" ? "전면 카메라로 전환" : "후면 카메라로 전환"}
          >
            <SwitchCamera size={16} className="text-gray-700" />
          </button>
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-10 p-1.5 bg-white/90 rounded-full shadow hover:bg-white"
          >
            <X size={16} className="text-gray-700" />
          </button>
          <p className="absolute bottom-0 left-0 right-0 text-center text-xs text-white/80 py-1.5 bg-black/50">
            {switching
              ? "카메라 전환 중..."
              : started
              ? `${facingMode === "environment" ? "후면" : "전면"} · 카메라에 코드를 비춰주세요`
              : "카메라 시작 중..."}
          </p>
        </div>
      </div>
    </div>
  );
}
