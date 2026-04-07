"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeCameraScanner({ onDetected, onClose }: Props) {
  const scannerRef = useRef<any>(null);
  const divId = "barcode-camera-scanner-div";

  useEffect(() => {
    let scanner: any;
    const init = async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      scanner = new Html5Qrcode(divId);
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            onDetected(decodedText);
          },
          undefined
        );
      } catch (err) {
        console.error("Camera start error:", err);
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
    <div className="mt-2 rounded-xl overflow-hidden border border-blue-200 relative">
      <div id={divId} className="w-full" />
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-full hover:bg-white shadow">
        <X size={16} className="text-gray-600" />
      </button>
      <p className="text-xs text-center text-gray-400 py-1 bg-white">
        카메라로 바코드를 비춰주세요
      </p>
    </div>
  );
}
