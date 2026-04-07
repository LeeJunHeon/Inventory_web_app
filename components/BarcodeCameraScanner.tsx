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
    let scanner: any;
    const init = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode(divId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            onDetected(decodedText);
          },
          undefined
        );
        setStarted(true);
      } catch (err: any) {
        const msg = String(err);
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          setError("카메라 권한이 거부되었습니다.\n브라우저 주소창 옆 자물쇠 아이콘에서 카메라 권한을 허용해주세요.");
        } else if (msg.includes("NotFoundError")) {
          setError("카메라를 찾을 수 없습니다.\n카메라가 연결되어 있는지 확인해주세요.");
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

  return (
    <div className="mt-2 rounded-xl border border-blue-200 overflow-hidden bg-black relative">
      {/* 에러 상태 */}
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 bg-gray-50">
          <CameraOff size={32} className="text-gray-400" />
          <p className="text-xs text-gray-500 text-center whitespace-pre-line">{error}</p>
          <button onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-300">
            닫기
          </button>
        </div>
      ) : (
        <>
          {/* html5-qrcode가 렌더링하는 div — 라이브러리 기본 버튼 숨기기 */}
          <div id={divId} className="w-full [&_button]:hidden [&_select]:hidden [&_img]:hidden [&_#html5-qrcode-anchor-scan-type-change]:hidden" />
          {/* 커스텀 닫기 버튼 */}
          <button onClick={onClose}
            className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full hover:bg-white shadow-md z-10">
            <X size={16} className="text-gray-700" />
          </button>
          {/* 안내 텍스트 */}
          {started && (
            <p className="text-xs text-center text-white/80 py-1.5 bg-black/60 absolute bottom-0 left-0 right-0">
              바코드를 사각형 안에 맞춰주세요
            </p>
          )}
        </>
      )}
    </div>
  );
}
