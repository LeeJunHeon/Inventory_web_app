"use client";
import { useEffect, useRef, useState } from "react";
import { X, CameraOff, SwitchCamera } from "lucide-react";

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

interface CamDevice { deviceId: string; label: string; }

export default function BarcodeCameraScanner({ onDetected, onClose }: Props) {
  const videoRef       = useRef<HTMLVideoElement>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const animFrameRef   = useRef<number | null>(null);
  const mountedRef     = useRef(true);
  const detectedRef    = useRef(false);
  const camerasRef     = useRef<CamDevice[]>([]);
  const curIdxRef      = useRef(0);

  const [error,      setError]      = useState<string | null>(null);
  const [started,    setStarted]    = useState(false);
  const [switching,  setSwitching]  = useState(false);
  const [camLabel,   setCamLabel]   = useState("");
  const [camCount,   setCamCount]   = useState(0);
  const [startKey,   setStartKey]   = useState(0); // 이 값이 바뀌면 useEffect 재실행

  // 광각/초광각 제외 후 최적 카메라 인덱스 선택
  const findBestIndex = (list: CamDevice[]): number => {
    const idx = list.findIndex(d => {
      const l = d.label.toLowerCase();
      const isRear = l.includes("back") || l.includes("rear") || l.includes("후면") ||
        (!l.includes("front") && !l.includes("face") && !l.includes("전면") && !l.includes("user"));
      const isWide = l.includes("wide") || l.includes("ultra") || l.includes("0.5") ||
        l.includes("광각") || l.includes("초광각");
      return isRear && !isWide;
    });
    // 못 찾으면 후면 카메라 중 아무거나
    if (idx >= 0) return idx;
    const rearIdx = list.findIndex(d => {
      const l = d.label.toLowerCase();
      return l.includes("back") || l.includes("rear") || l.includes("후면");
    });
    return rearIdx >= 0 ? rearIdx : 0;
  };

  const stopAll = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // 카메라 label 간소화 표시
  const displayLabel = (label: string, idx: number): string => {
    const l = label.toLowerCase();
    if (l.includes("front") || l.includes("face") || l.includes("전면") || l.includes("user")) return "전면";
    if (l.includes("wide") || l.includes("ultra") || l.includes("광각")) return "후면 광각";
    if (l.includes("back") || l.includes("rear") || l.includes("후면")) return "후면";
    if (camCount > 1) return `카메라 ${idx + 1}`;
    return "후면";
  };

  useEffect(() => {
    mountedRef.current = true;
    detectedRef.current = false;
    setError(null);
    setStarted(false);

    const run = async () => {
      try {
        if (!videoRef.current || !mountedRef.current) return;

        // 첫 실행: 권한 획득 후 카메라 목록 열거
        if (startKey === 0) {
          // facingMode로 일단 권한만 받고 바로 종료 — 이 후 label 열거 가능
          const tmpStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          });
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          tmpStream.getTracks().forEach(t => t.stop());

          if (!mountedRef.current) return;

          const videoDevices = allDevices
            .filter(d => d.kind === "videoinput" && d.deviceId)
            .map(d => ({ deviceId: d.deviceId, label: d.label }));

          camerasRef.current = videoDevices;
          setCamCount(videoDevices.length);
          curIdxRef.current = findBestIndex(videoDevices);
        }

        const cameras = camerasRef.current;
        const idx = curIdxRef.current;
        const device = cameras[idx];

        // deviceId로 특정 카메라 지정 (광각 회피 핵심)
        const constraints: MediaStreamConstraints = device?.deviceId
          ? { video: { deviceId: { exact: device.deviceId } } }
          : { video: { facingMode: { ideal: "environment" } } };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (!mountedRef.current) { stopAll(); return; }

        const video = videoRef.current;
        video.srcObject = stream;

        // playing 이벤트 대기 — 실제 프레임 출력 시점
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("timeout")), 10000);
          video.addEventListener("playing", () => { clearTimeout(t); resolve(); }, { once: true });
          video.play().catch(reject);
        });

        if (!mountedRef.current) { stopAll(); return; }

        // 실제 사용된 카메라 label 표시
        const activeLabel = stream.getVideoTracks()[0]?.label || device?.label || "";
        setCamLabel(displayLabel(activeLabel, idx));

        // ZXing import — canvas 디코딩 전용
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx || !mountedRef.current) return;

        setStarted(true);
        setSwitching(false);

        // requestAnimationFrame 루프 — 매 프레임 canvas 스캔
        const scan = () => {
          if (!mountedRef.current || detectedRef.current) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            try {
              const result = reader.decodeFromCanvas(canvas);
              if (result && mountedRef.current && !detectedRef.current) {
                detectedRef.current = true;
                onDetected(result.getText());
                return;
              }
            } catch { /* NotFoundException — 이번 프레임에 코드 없음, 정상 */ }
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

    run();

    return () => {
      mountedRef.current = false;
      stopAll();
    };
  }, [startKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchCamera = () => {
    if (!started || camerasRef.current.length <= 1) return;
    setSwitching(true);
    setStarted(false);
    detectedRef.current = false;
    stopAll();
    curIdxRef.current = (curIdxRef.current + 1) % camerasRef.current.length;
    mountedRef.current = true;
    setStartKey(k => k + 1);
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
          <video ref={videoRef} className="w-full" playsInline muted />
          {camCount > 1 && (
            <button
              onClick={switchCamera}
              disabled={switching || !started}
              className="absolute top-2 left-2 z-10 p-1.5 bg-white/90 rounded-full shadow hover:bg-white disabled:opacity-40"
              title="다음 카메라로 전환"
            >
              <SwitchCamera size={16} className="text-gray-700" />
            </button>
          )}
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
              ? `${camLabel} · 카메라에 코드를 비춰주세요`
              : "카메라 시작 중..."}
          </p>
        </div>
      </div>
    </div>
  );
}
