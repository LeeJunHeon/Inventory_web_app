"use client";
import { useEffect, useRef, useState } from "react";
import { X, CameraOff, SwitchCamera } from "lucide-react";

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeCameraScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const detectedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [switching, setSwitching] = useState(false);

  const stopAll = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    detectedRef.current = false;
    setError(null);
    setStarted(false);

    const init = async () => {
      try {
        if (!videoRef.current || !mountedRef.current) return;

        // 1. 카메라 스트림 직접 획득
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
        });
        streamRef.current = stream;

        if (!mountedRef.current) { stopAll(); return; }

        // 2. video에 스트림 연결 — ZXing에게 video 관리 맡기지 않음
        const video = videoRef.current;
        video.srcObject = stream;

        // 3. 실제로 프레임이 나올 때까지 대기 (playing 이벤트)
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("camera timeout")), 10000);
          video.addEventListener("playing", () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
          video.play().catch(reject);
        });

        if (!mountedRef.current) { stopAll(); return; }

        // 4. ZXing은 canvas 디코딩만 담당 — video 관리 일절 없음
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        setStarted(true);
        setSwitching(false);

        // 5. requestAnimationFrame 루프로 매 프레임 스캔
        const scan = () => {
          if (!mountedRef.current || detectedRef.current) return;

          // video가 실제 프레임을 출력 중일 때만 디코딩 시도
          if (video.readyState >= 2 && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            try {
              const result = reader.decodeFromCanvas(canvas);
              if (result && mountedRef.current && !detectedRef.current) {
                detectedRef.current = true;
                onDetected(result.getText());
                return; // 인식 후 루프 종료
              }
            } catch {
              // NotFoundException — 이번 프레임에 코드 없음, 정상
            }
          }

          animFrameRef.current = requestAnimationFrame(scan);
        };

        animFrameRef.current = requestAnimationFrame(scan);
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
      stopAll();
    };
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchCamera = () => {
    if (!started) return;
    setSwitching(true);
    setStarted(false);
    detectedRef.current = false;
    stopAll();
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
