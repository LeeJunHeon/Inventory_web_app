"use client";
import { useEffect, useRef, useState } from "react";
import { X, CameraOff } from "lucide-react";

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeCameraScanner({ onDetected, onClose }: Props) {
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const divId = "barcode-camera-scanner-div";

  useEffect(() => {
    const init = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(divId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => { onDetected(decodedText); },
          undefined
        );
        setStarted(true);
      } catch (err: any) {
        const msg = String(err);
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
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  if (error) {
    return (
      <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center gap-3 py-6 px-4">
        <CameraOff size={28} className="text-gray-400" />
        <p className="text-xs text-gray-500 text-center whitespace-pre-line leading-relaxed">{error}</p>
        <button onClick={onClose}
          className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-300">
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-blue-200 overflow-hidden relative bg-black">
      <div
        id={divId}
        className="w-full [&_button]:hidden [&_select]:hidden [&_img]:hidden [&_#html5-qrcode-anchor-scan-type-change]:hidden"
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
  );
}
