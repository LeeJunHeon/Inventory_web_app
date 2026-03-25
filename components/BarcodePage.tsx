"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, Trash2, Copy, QrCode, Check, X, Loader2, Printer, ImageDown } from "lucide-react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { CATEGORY_COLORS } from "@/lib/data";

interface BarcodeItem {
  id: number; code: string; itemCode: string; itemName: string;
  category: string; targetUnitId: number | null; isActive: string;
}
interface ItemOption { id: number; code: string; name: string; }

const CATS = ["전체", "타겟", "웨이퍼", "가스", "기자재/소모품"];

export default function BarcodePage() {
  const [barcodes, setBarcodes]         = useState<BarcodeItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [showCreate, setShowCreate]     = useState(false);

  // 바코드 생성 폼 상태
  const [createCategory, setCreateCategory] = useState("웨이퍼");
  const [createItemId, setCreateItemId]     = useState<number | null>(null);
  const [createItemCode, setCreateItemCode] = useState("");
  const [createItemName, setCreateItemName] = useState("");
  const [createMaterial, setCreateMaterial] = useState("");
  const [itemOptions, setItemOptions]       = useState<ItemOption[]>([]);
  const [showItemDrop, setShowItemDrop]     = useState(false);
  const [creating, setCreating]             = useState(false);
  const [createError, setCreateError]       = useState("");
  const [createSuccess, setCreateSuccess]   = useState("");
  const [toast, setToast]                   = useState("");
  const [printItem, setPrintItem]           = useState<BarcodeItem | null>(null);
  const itemDropRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter !== "전체") params.set("category", categoryFilter);
      const res = await fetch(`/api/barcodes?${params}`);
      if (res.ok) setBarcodes(await res.json());
    } catch { setToast("바코드 목록 조회 실패"); setTimeout(() => setToast(""), 3000); }
    finally { setLoading(false); }
  }, [search, categoryFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // 바코드 생성 폼 품목군 바뀔 때 품목 로드
  useEffect(() => {
    fetch(`/api/items?category=${encodeURIComponent(createCategory)}`)
      .then(r => r.json()).then(setItemOptions).catch(console.error);
    setCreateItemId(null); setCreateItemCode(""); setCreateItemName("");
  }, [createCategory]);

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (itemDropRef.current && !itemDropRef.current.contains(e.target as Node))
        setShowItemDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 바코드 생성+저장
  const handleCreate = async () => {
    if (!createItemId) { setCreateError("품목을 선택해주세요."); return; }
    setCreateError(""); setCreating(true);
    try {
      const res = await fetch("/api/barcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: createItemId,
          materialName: createMaterial || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || "생성 실패"); return; }

      setCreateSuccess(`바코드 ${data.code} 생성 완료!`);
      setTimeout(() => setCreateSuccess(""), 3000);
      // 폼 초기화
      setCreateItemId(null); setCreateItemCode(""); setCreateItemName(""); setCreateMaterial("");
      fetchData();
    } catch { setCreateError("네트워크 오류"); }
    finally { setCreating(false); }
  };

  // 바코드 삭제
  const handleDelete = async (b: BarcodeItem) => {
    if (!confirm(`바코드 "${b.code}" 를 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/barcodes?id=${b.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "삭제 실패"); return; }
      fetchData();
    } catch { alert("네트워크 오류"); }
  };

  // 이미지 저장: 400px 고해상도 QRCodeCanvas를 1:1로 복사해 텍스트 합성
  const handleSaveImage = () => {
    if (!printItem) return;
    // 화면 밖 고해상도 canvas (400×400)
    const qrCanvas = document.querySelector(".barcode-label-canvas canvas") as HTMLCanvasElement | null;
    if (!qrCanvas) return;

    const QR = 400; // QRCodeCanvas size prop과 동일
    const PAD = 30;
    const TEXT_H = 80; // 텍스트 영역 높이

    const out = document.createElement("canvas");
    out.width  = QR + PAD * 2;        // 460
    out.height = QR + PAD + TEXT_H;   // 510

    const ctx = out.getContext("2d")!;

    // 흰 배경
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);

    // QR 코드 1:1 복사 (원본 400px → 그대로)
    ctx.drawImage(qrCanvas, PAD, PAD, QR, QR);

    // 구분선
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, QR + PAD + 8);
    ctx.lineTo(out.width - PAD, QR + PAD + 8);
    ctx.stroke();

    // 바코드 코드
    ctx.fillStyle = "#111827";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.fillText(printItem.code, out.width / 2, QR + PAD + 42);

    // 품목명
    if (printItem.itemName) {
      ctx.fillStyle = "#374151";
      ctx.font = "20px sans-serif";
      ctx.fillText(printItem.itemName, out.width / 2, QR + PAD + 70);
    }

    const link = document.createElement("a");
    link.download = `${printItem.code}.png`;
    link.href = out.toDataURL("image/png");
    link.click();
  };

  // 인쇄: body에 직접 라벨 div를 append → window.print() → afterprint 시 제거
  const handlePrint = () => {
    if (!printItem) return;
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
    <div className="space-y-5">
      {/* 프린트 미리보기 모달 */}
      {printItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">라벨 미리보기</h3>
              <button onClick={() => setPrintItem(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>
            {/* 미리보기 */}
            <div className="flex items-center gap-4 border border-gray-200 rounded-xl p-4 bg-gray-50">
              <div className="shrink-0">
                <QRCodeCanvas value={printItem.code} size={80} />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold font-mono text-gray-900">{printItem.code}</p>
                <p className="text-sm text-gray-700">{printItem.itemName}</p>
                <p className="text-xs text-gray-400 font-mono">{printItem.itemCode}</p>
              </div>
            </div>
            {/* 이미지 저장용 고해상도 QRCodeCanvas (화면 밖) */}
            <div className="barcode-label-canvas" aria-hidden style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
              <QRCodeCanvas value={printItem.code} size={400} />
            </div>
            {/* body.appendChild에 복사될 실제 라벨 콘텐츠 (hidden) */}
            <div className="print-label-content" style={{ display: "none" }}>
              <QRCodeSVG value={printItem.code} size={64} />
              <div className="label-text">
                <div className="label-code">{printItem.code}</div>
                <div className="label-name">{printItem.itemName}</div>
                <div className="label-item">{printItem.itemCode}</div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPrintItem(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
                취소
              </button>
              <button onClick={handleSaveImage}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100">
                <ImageDown size={15} />이미지 저장
              </button>
              <button onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600">
                <Printer size={15} />인쇄
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">바코드 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">바코드 조회, 생성, 출력을 관리합니다</p>
        </div>
        <button onClick={() => {
            if (showCreate) {
              // 닫을 때 폼 전체 리셋
              setCreateItemId(null); setCreateItemCode(""); setCreateItemName(""); setCreateMaterial("");
            }
            setShowCreate(!showCreate); setCreateError(""); setCreateSuccess("");
          }}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 shadow-sm">
          <Plus size={16} />새 바코드 생성
        </button>
      </div>

      {/* ── 바코드 생성 폼 ── */}
      {showCreate && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-bold text-blue-900">새 바코드 생성</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 품목군 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">품목군</label>
              <select value={createCategory} onChange={e => setCreateCategory(e.target.value)}
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none">
                {["타겟", "웨이퍼", "가스", "기자재/소모품"].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* 품목코드 + 선택 */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">품목코드</label>
              <div className="relative" ref={itemDropRef}>
                <div className="flex gap-1">
                  <input value={createItemCode} readOnly placeholder="자동 입력"
                    className="flex-1 px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-sm" />
                  <button onClick={() => setShowItemDrop(v => !v)}
                    className="px-3 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-semibold hover:bg-blue-600">
                    선택
                  </button>
                </div>
                {showItemDrop && (
                  <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {itemOptions.length === 0 ? (
                      <p className="px-3 py-2.5 text-sm text-gray-400">등록된 품목 없음</p>
                    ) : itemOptions.map(opt => (
                      <button key={opt.id} onClick={() => {
                        setCreateItemId(opt.id); setCreateItemCode(opt.code); setCreateItemName(opt.name);
                        setShowItemDrop(false);
                      }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0">
                        <span className="font-medium text-gray-900">{opt.name}</span>
                        <span className="ml-2 text-xs text-gray-400 font-mono">{opt.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 물질명 (타겟 전용) */}
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">
                {createCategory === "타겟" ? "물질명 (타겟)" : "품목명"}
              </label>
              {createCategory === "타겟" ? (
                <input type="text" value={createMaterial} onChange={e => setCreateMaterial(e.target.value)}
                  placeholder='예: Au 2" 0.125t'
                  className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm outline-none bg-white" />
              ) : (
                <input value={createItemName} readOnly placeholder="자동 입력"
                  className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-sm" />
              )}
            </div>

            {/* 버튼 */}
            <div className="flex items-end gap-2">
              <button onClick={handleCreate} disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                <QrCode size={16} />{creating ? "생성 중..." : "생성+저장"}
              </button>
            </div>
          </div>

          {createError   && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{createError}</p>}
          {createSuccess && <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl">{createSuccess}</p>}
        </div>
      )}

      {/* ── 검색 필터 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="바코드, 품목코드, 품목명 검색..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 overflow-x-auto">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${categoryFilter === c ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 바코드 목록 ── */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* 데스크탑 테이블 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">바코드</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목코드</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목명</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">품목군</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">타겟ID</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">활성</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-5 py-3">작업</th>
              </tr></thead>
              <tbody>
                {barcodes.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">등록된 바코드가 없습니다</td></tr>
                ) : barcodes.map((b) => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-blue-50/30 group">
                    <td className="px-5 py-3 text-sm text-gray-400">{b.id}</td>
                    <td className="px-5 py-3 text-sm font-mono font-semibold text-gray-900">{b.code}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{b.itemCode}</td>
                    <td className="px-5 py-3 text-sm text-gray-900">{b.itemName}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[b.category] || ""}`}>{b.category}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 font-mono">
                      {b.targetUnitId ? `TU-${String(b.targetUnitId).padStart(3, "0")}` : "-"}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {b.isActive === "Y"
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><Check size={12} />활성</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"><X size={12} />비활성</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { navigator.clipboard.writeText(b.code); setToast(`${b.code} 복사됨`); setTimeout(() => setToast(""), 2000); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="바코드 복사">
                          <Copy size={15} />
                        </button>
                        <button onClick={() => setPrintItem(b)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="라벨 인쇄">
                          <Printer size={15} />
                        </button>
                        <button onClick={() => handleDelete(b)}
                          className="p-1.5 rounded-lg hover:bg-rose-100 text-gray-400 hover:text-rose-600" title="삭제">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden divide-y divide-gray-50">
            {barcodes.map((b) => (
              <div key={b.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono font-bold text-gray-900">{b.code}</span>
                  <div className="flex items-center gap-2">
                    {b.isActive === "Y"
                      ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">활성</span>
                      : <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">비활성</span>}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[b.category] || ""}`}>{b.category}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-700">{b.itemName}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {b.itemCode}{b.targetUnitId ? ` · TU-${String(b.targetUnitId).padStart(3, "0")}` : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPrintItem(b)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="라벨 인쇄">
                      <Printer size={15} />
                    </button>
                    <button onClick={() => handleDelete(b)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">총 <span className="font-semibold text-gray-700">{barcodes.length}건</span></p>
          </div>
        </div>
      )}
    </div>
  );
}
