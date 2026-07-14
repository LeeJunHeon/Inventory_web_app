"use client";

import { X, Printer, ImageDown } from "lucide-react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { useT } from "@/lib/i18n";

interface Props {
  code: string;
  itemCode?: string;
  itemName?: string;
  memo?: string | null;
  onClose: () => void;
  /** 오버레이 z-index Tailwind 클래스 (기본 z-50). 다른 팝업 위에 띄울 때 override */
  overlayZ?: string;
}

export default function BarcodeLabelModal({ code, itemCode, itemName, memo, onClose, overlayZ = "z-50" }: Props) {
  const { t } = useT();

  // 이미지 저장: 400px 고해상도 QRCodeCanvas를 1:1로 복사해 텍스트 합성
  const handleSaveImage = () => {
    const qrCanvas = document.querySelector<HTMLCanvasElement>(
      ".qr-canvas-hidden canvas"
    );
    if (!qrCanvas) return;

    // 가로 레이아웃: QR(160) + 여백 + 텍스트 영역
    const QR = 160;
    const PAD = 16;
    const TEXT_X = QR + PAD * 2 + 8;
    const W = QR + PAD * 2 + 240;  // 전체 너비
    const H = QR + PAD * 2 + 20;    // 품목명 줄바꿈 대비 20px 추가

    const out = document.createElement("canvas");
    out.width  = W;
    out.height = H;
    const ctx = out.getContext("2d")!;

    // 흰 배경
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // QR 코드 (좌측)
    ctx.drawImage(qrCanvas, PAD, PAD, QR, QR);

    // 구분선
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(QR + PAD * 2, PAD);
    ctx.lineTo(QR + PAD * 2, H - PAD);
    ctx.stroke();

    // 바코드 코드 (굵게)
    ctx.fillStyle = "#111827";
    ctx.font = "bold 22px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(code, TEXT_X, PAD + 8);

    // 품목명 줄바꿈 처리 (최대 너비 초과 시 다음 줄로)
    let line2 = "";
    if (itemName) {
      const maxTextW = W - TEXT_X - PAD;
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#374151";
      const words = itemName.split(" ");
      let line1 = "";
      let isSecondLine = false;
      for (const word of words) {
        const test = (line1 ? line1 + " " : "") + word;
        if (!isSecondLine && ctx.measureText(test).width > maxTextW) {
          isSecondLine = true;
          line2 = word;
        } else if (isSecondLine) {
          line2 += (line2 ? " " : "") + word;
        } else {
          line1 = test;
        }
      }
      ctx.fillText(line1, TEXT_X, PAD + 38);
      if (line2) ctx.fillText(line2, TEXT_X, PAD + 58);
    }

    // 품목명 2줄이면 아래로 20px 이동
    const nameOffset = line2 ? 20 : 0;

    // 품목코드
    if (itemCode) {
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#9ca3af";
      ctx.fillText(itemCode, TEXT_X, PAD + 68 + nameOffset);
    }

    // 메모
    if (memo) {
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#9ca3af";
      const memoText = memo.length > 28
        ? memo.slice(0, 28) + "…"
        : memo;
      ctx.fillText(memoText, TEXT_X, PAD + 90 + nameOffset);
    }

    const link = document.createElement("a");
    link.download = `${code}.png`;
    link.href = out.toDataURL("image/png");
    link.click();
  };

  // 인쇄: body에 직접 라벨 div를 append → window.print() → afterprint 시 제거
  const handlePrint = () => {
    const content = document.querySelector(".print-label-content");
    if (!content) return;

    const printDiv = document.createElement("div");
    printDiv.className = "print-label";
    printDiv.innerHTML = content.innerHTML;
    document.body.appendChild(printDiv);

    const cleanup = () => {
      document.body.removeChild(printDiv);
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  return (
    <div className={`fixed inset-0 ${overlayZ} flex items-center justify-center p-4`} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{t.barcode.printTitle}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>
        {/* 미리보기 */}
        <div className="flex items-center gap-4 border border-gray-200 rounded-xl p-4 bg-gray-50">
          <div className="shrink-0">
            <QRCodeCanvas value={code} size={80} />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-bold font-mono text-gray-900">{code}</p>
            <p className="text-sm text-gray-700">{itemName}</p>
            <p className="text-xs text-gray-400 font-mono">{itemCode}</p>
          </div>
        </div>
        {/* 이미지 저장용 고해상도 QRCodeCanvas (화면 밖) */}
        <div className="qr-canvas-hidden barcode-label-canvas" aria-hidden style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          <QRCodeCanvas value={code} size={400} />
        </div>
        {/* body.appendChild에 복사될 실제 라벨 콘텐츠 (hidden) */}
        <div className="print-label-content" style={{ display: "none" }}>
          <QRCodeSVG value={code} size={64} />
          <div className="label-text">
            <div className="label-code">{code}</div>
            <div className="label-name">{itemName}</div>
            <div className="label-item">{itemCode}</div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
            {t.common.cancel}
          </button>
          <button onClick={handleSaveImage}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100">
            <ImageDown size={15} />{t.barcode.saveImage}
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600">
            <Printer size={15} />{t.barcode.print}
          </button>
        </div>
      </div>
    </div>
  );
}
