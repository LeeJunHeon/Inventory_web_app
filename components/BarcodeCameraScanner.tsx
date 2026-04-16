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
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [switching, setSwitching] = useState(false);

  const stopAll = () => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    setError(null);
    setStarted(false);

    const init = async () => {
      try {
        if (!videoRef.current || !mountedRef.current) return;

        // 1. 스트림을 직접 획득 (ZXing에 맡기지 않음)
        // — 모바일 카메라는 준비 시간이 필요하므로 우리가 직접 제어
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
        });
        streamRef.current = stream;

        if (!mountedRef.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        // 2. 비디오에 스트림 연결 후 loadedmetadata 이벤트 대기
        // — videoWidth/videoHeight 가 0인 상태에서 ZXing이 시작하는 것을 방지
        const video = videoRef.current;
        video.srcObject = stream;

        await new Promise<void>(resolve => {
          if (video.readyState >= 1) {
            resolve();
          } else {
            video.addEventListener("loadedmetadata", () => resolve(), { once: true });
          }
        });

        if (!mountedRef.current) {
          stopAll();
          return;
        }

        // 3. ZXing import (hints 없음 — 기본값으로 QR + 모든 바코드 포맷 인식)
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 200,
        });

        // 4. decodeFromConstraints 대신 decodeFromStream 사용
        // — 이미 준비된 스트림을 넘기므로 타이밍 문제 없음
        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current,
          (result, _err) => {
            if (result && mountedRef.current) {
              onDetected(result.getText());
            }
          }
        );

        if (!mountedRef.current) {
          controls.stop();
          stopAll();
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
      stopAll();
    };
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchCamera = () => {
    if (!started) return;
    setSwitching(true);
    setStarted(false);
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
