"use client";

import { useState, useEffect, useRef } from "react";
import { X, ScanLine, PenLine } from "lucide-react";
import { TYPE_COLORS, CATEGORY_COLORS } from "@/lib/data";

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ItemOption     { id: number; code: string; name: string; }
interface PartnerOption  { id: number; name: string; type: string; }
interface LocationOption { id: number; name: string; }

export default function TransactionModal({ isOpen, onClose, onSuccess }: TransactionModalProps) {
  const [type, setType]         = useState<"입고" | "출고" | "불출">("입고");
  const [category, setCategory] = useState("웨이퍼");

  const [date, setDate]             = useState(new Date().toISOString().split("T")[0]);
  const [itemId, setItemId]         = useState<number | null>(null);
  const [itemCode, setItemCode]     = useState("");
  const [itemName, setItemName]     = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeId, setBarcodeId]     = useState<number | null>(null);
  const [targetUnitId, setTargetUnitId] = useState<number | null>(null);
  const [refTxNo, setRefTxNo]         = useState<string | null>(null);
  const [directInput, setDirectInput] = useState(false); // false=스캔모드, true=직접입력모드
  const [quantity, setQuantity]     = useState("");
  const [unitPrice, setUnitPrice]   = useState("");
  const [partnerId, setPartnerId]   = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [memo, setMemo]             = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  const [itemOptions, setItemOptions]         = useState<ItemOption[]>([]);
  const [partnerOptions, setPartnerOptions]   = useState<PartnerOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [locationId, setLocationId]           = useState<number>(1);
  const [showItemSelector, setShowItemSelector] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  // 모달 열릴 때 거래처 + 위치 로드 (한 번만)
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/partners")
      .then(r => r.json()).then(setPartnerOptions).catch(console.error);
    fetch("/api/locations")
      .then(r => r.json()).then((locs: LocationOption[]) => {
        // 거래 입력용: 본사(id=1), 공덕(id=2)만 표시
        const txLocs = locs.filter(l => l.id === 1 || l.id === 2);
        const filtered = txLocs.length > 0 ? txLocs : locs;
        setLocationOptions(filtered);
        // id=1이 없으면 첫 번째 항목을 기본값으로
        if (!filtered.find(l => l.id === 1) && filtered.length > 0) {
          setLocationId(filtered[0].id);
        }
      }).catch(console.error);
  }, [isOpen]);

  // 모달 닫힐 때 전체 폼 초기화
  useEffect(() => {
    if (!isOpen) {
      setType("입고"); setCategory("웨이퍼"); setDate(new Date().toISOString().split("T")[0]);
      setItemId(null); setItemCode(""); setItemName("");
      setBarcodeInput(""); setBarcodeId(null); setTargetUnitId(null); setRefTxNo(null);
      setDirectInput(false);
      setQuantity(""); setUnitPrice("");
      setPartnerId(null); setPartnerName("");
      setLocationId(1);
      setMemo(""); setError(""); setShowItemSelector(false);
    }
  }, [isOpen]);

  // 품목군 바뀔 때 품목 목록 새로 로드 + 선택 초기화
  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/items?category=${encodeURIComponent(category)}`)
      .then(r => r.json()).then(setItemOptions).catch(console.error);
    setItemId(null); setItemCode(""); setItemName("");
    setShowItemSelector(false);
  }, [category]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node))
        setShowItemSelector(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 직접입력 토글 시 바코드/품목 초기화
  const handleToggleDirectInput = () => {
    setDirectInput(v => !v);
    setBarcodeInput(""); setBarcodeId(null); setTargetUnitId(null); setRefTxNo(null);
    setItemId(null); setItemCode(""); setItemName("");
    setError("");
  };

  // 바코드 조회 — 출고/불출: /lookup (refTxNo 포함), 입고: /barcodes?search
  const handleBarcodeLookup = async () => {
    if (!barcodeInput.trim()) return;
    setError("");
    try {
      if (type === "출고" || type === "불출") {
        const res = await fetch(`/api/barcodes/lookup?code=${encodeURIComponent(barcodeInput.trim())}`);
        const bc = await res.json();
        if (!res.ok) { setError(bc.error || "바코드 조회 실패"); return; }
        setBarcodeId(bc.barcodeId);
        setTargetUnitId(bc.targetUnitId ?? null);
        setRefTxNo(bc.refTxNo ?? null);
        if (bc.category && bc.category !== category) {
          // setCategory → category useEffect가 setItemCode/setItemName을 "" 로 초기화함
          // await 이후에 덮어써야 하므로 setItemCode/setItemName은 아래로 이동
          setCategory(bc.category);
          const items = await fetch(`/api/items?category=${encodeURIComponent(bc.category)}`).then(r => r.json());
          setItemOptions(items);
          const found = items.find((i: ItemOption) => i.id === bc.itemId);
          if (found) setItemId(found.id);
        } else {
          if (bc.itemId) setItemId(bc.itemId);
        }
        // useEffect([category])가 초기화한 뒤에 덮어씀
        setItemCode(bc.itemCode);
        setItemName(bc.itemName);
      } else {
        // 입고: 단순 바코드 조회
        const res = await fetch(`/api/barcodes?search=${encodeURIComponent(barcodeInput.trim())}`);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) { setError("해당 바코드를 찾을 수 없습니다. (비활성 바코드이거나 미등록 바코드)"); return; }
        const bc = data[0];
        setBarcodeId(bc.id);
        setTargetUnitId(bc.targetUnitId ?? null);
        if (bc.category && bc.category !== category) {
          // setCategory → category useEffect가 setItemCode/setItemName을 "" 로 초기화함
          // await 이후에 덮어써야 하므로 setItemCode/setItemName은 아래로 이동
          setCategory(bc.category);
          const items = await fetch(`/api/items?category=${encodeURIComponent(bc.category)}`).then(r => r.json());
          setItemOptions(items);
          const found = items.find((i: ItemOption) => i.code === bc.itemCode);
          if (found) setItemId(found.id);
        } else {
          const found = itemOptions.find(i => i.code === bc.itemCode);
          if (found) setItemId(found.id);
        }
        // useEffect([category])가 초기화한 뒤에 덮어씀
        setItemCode(bc.itemCode);
        setItemName(bc.itemName);
      }
    } catch { setError("바코드 조회 실패"); }
  };

  // 금액 자동계산
  const amount = Number(quantity || 0) * Number(unitPrice || 0);

  // 저장
  const handleSave = async () => {
    if (!itemId)                            { setError("품목을 선택해주세요.");  return; }
    if (!quantity || Number(quantity) <= 0) { setError("수량을 입력해주세요.");  return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txDate:    date,
          txType:    type,
          itemId,
          qty:       Number(quantity),
          unitPrice: Number(unitPrice) || null,
          amount:    amount || null,
          partnerId: partnerId || null,
          memo:      memo || null,
          barcodeId:    barcodeId    || null,
          targetUnitId: targetUnitId || null,
          refTxNo:      refTxNo      || null,
          locationId:   locationId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "저장 실패"); return;
      }
      onSuccess?.();
      onClose();
    } catch {
      setError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">새 기록 작성</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* 구분 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">구분</label>
            <div className="flex gap-2">
              {(["입고", "출고", "불출"] as const).map((t) => (
                <button key={t} onClick={() => { setType(t); setBarcodeInput(""); setBarcodeId(null); setRefTxNo(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    type === t
                      ? `${TYPE_COLORS[t].bg} ${TYPE_COLORS[t].text} ${TYPE_COLORS[t].border} border-2 shadow-sm`
                      : "bg-gray-50 text-gray-500 border-2 border-transparent hover:bg-gray-100"
                  }`}>{t}</button>
              ))}
            </div>
          </div>

          {/* 날짜 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">날짜</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>

          {/* 바코드 — 입고/출고/불출 모두 표시 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">바코드</label>
              <button onClick={handleToggleDirectInput}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  directInput
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}>
                {directInput ? <><PenLine size={12} />직접 입력 중</> : <><ScanLine size={12} />스캔 모드</>}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !directInput && handleBarcodeLookup()}
                placeholder={directInput ? "직접 입력 모드 (바코드 비활성)" : "바코드를 스캔하거나 입력하세요"}
                disabled={directInput}
                className={`flex-1 px-4 py-2.5 border rounded-xl text-sm outline-none transition-colors ${
                  directInput
                    ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                    : "border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                }`}
              />
              <button onClick={handleBarcodeLookup} disabled={directInput}
                className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
                조회
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {directInput
                ? "품목을 직접 선택합니다 (바코드 미연결)"
                : "바코드를 스캔하면 품목이 자동으로 선택됩니다"}
            </p>
            {/* 출고/불출에서 refTxNo 자동 연결 안내 */}
            {(type === "출고" || type === "불출") && refTxNo && (
              <p className="mt-1 text-xs text-blue-600 font-medium">입고 참조: {refTxNo}</p>
            )}
            {/* 타겟 ID 연결 안내 */}
            {targetUnitId && (
              <span className="inline-flex items-center mt-1.5 gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700">
                타겟 ID: TU-{String(targetUnitId).padStart(3, "0")} 연결됨
              </span>
            )}
          </div>

          {/* 품목군 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">품목군</label>
            <div className="flex gap-2 flex-wrap">
              {["웨이퍼", "타겟", "가스", "기자재/소모품"].map((c) => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    category === c
                      ? `${CATEGORY_COLORS[c]} shadow-sm ring-1 ring-gray-200`
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}>{c}</button>
              ))}
            </div>
          </div>

          {/* 품목코드 / 품목명 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">품목코드</label>
              <div className="relative" ref={selectorRef}>
                <div className="flex gap-2">
                  <input value={itemCode} readOnly placeholder="자동 입력"
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                  <button
                    onClick={() => setShowItemSelector(v => !v)}
                    className="px-3 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors whitespace-nowrap">
                    선택
                  </button>
                </div>
                {showItemSelector && (
                  <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {itemOptions.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400">해당 품목군에 등록된 품목이 없습니다</p>
                    ) : (
                      itemOptions.map(opt => (
                        <button key={opt.id}
                          onClick={() => {
                            setItemId(opt.id); setItemCode(opt.code); setItemName(opt.name);
                            // 직접 선택 시 바코드/타겟 연결 항상 해제
                            setBarcodeId(null); setTargetUnitId(null); setRefTxNo(null);
                            setShowItemSelector(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                          <span className="font-medium text-gray-900">{opt.name}</span>
                          <span className="ml-2 text-xs text-gray-400 font-mono">{opt.code}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">품목명</label>
              <input value={itemName} readOnly placeholder="자동 입력"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          {/* 수량 / 단가 / 금액 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">수량 <span className="text-rose-500">*</span></label>
              <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">단가</label>
              <input type="text" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="₩0"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">금액</label>
              <input type="text" value={amount ? `₩${amount.toLocaleString()}` : ""} readOnly placeholder="자동 계산"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          {/* 거래처 / 불출처 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {type === "불출" ? "불출처" : "거래처"}
            </label>
            <select
              value={partnerId ?? ""}
              onChange={e => {
                const id = Number(e.target.value);
                setPartnerId(id || null);
                const found = partnerOptions.find(p => p.id === id);
                setPartnerName(found?.name || "");
              }}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
              <option value="">선택하세요</option>
              {partnerOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* 위치 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              위치 <span className="text-rose-500">*</span>
            </label>
            <select
              value={locationId}
              onChange={e => setLocationId(Number(e.target.value))}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
              {locationOptions.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          {/* 비고 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">비고</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="메모 입력 (선택사항)" rows={2}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
          </div>

          {/* 에러 */}
          {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>}
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            취소
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-60">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
