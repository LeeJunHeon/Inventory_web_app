"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { X, List, Loader2, Plus, Camera } from "lucide-react";
import { TYPE_COLORS, CATEGORY_COLORS } from "@/lib/data";
import InboundSelectModal, { type InboundTx } from "./InboundSelectModal";
import BarcodeCameraScanner from "./BarcodeCameraScanner";
import { useT } from "@/lib/i18n";
import DatePicker           from "./DatePicker";

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ItemOption     { id: number; code: string; name: string; }
interface PartnerOption  {
  id: number;
  name: string;
  type: string;
  contact?: string | null;
  email?: string | null;
  managerName?: string | null;
}
interface TxReasonOption { id: number; name: string; }
interface UserOption { id: number; name: string; role: string; }
interface LocationOption { id: number; name: string; }
interface BarcodeOption  { id: number; code: string; itemCode: string; itemName: string; isActive: string; remainQty: number; }
interface WaferSpecInfo  {
  waferType: string | null; diameterInch: number | null;
  resistivity: string | null; thicknessNote: string | null;
  orientation: string | null; surface: string | null;
}
interface SelectedInbound {
  txNo: string;
  txDate: string;
  remainQty: number;
  barcodeId: number | null;
  targetUnitId: number | null;
  partnerName: string;
  itemCode:     string;
  barcodeCode:  string;
}

const HANGUL_TO_ENG: Record<string, string> = {
  'ㅂ':'q','ㅈ':'w','ㄷ':'e','ㄱ':'r','ㅅ':'t','ㅛ':'y','ㅕ':'u','ㅑ':'i','ㅐ':'o','ㅔ':'p',
  'ㅁ':'a','ㄴ':'s','ㅇ':'d','ㄹ':'f','ㅎ':'g','ㅗ':'h','ㅓ':'j','ㅏ':'k','ㅣ':'l',
  'ㅋ':'z','ㅌ':'x','ㅊ':'c','ㅍ':'v','ㅠ':'b','ㅜ':'n','ㅡ':'m',
  'ㅃ':'Q','ㅉ':'W','ㄸ':'E','ㄲ':'R','ㅆ':'T','ㅒ':'O','ㅖ':'P',
  'ㅘ':'hk','ㅙ':'ho','ㅚ':'hl','ㅝ':'nj','ㅞ':'np','ㅟ':'nl','ㅢ':'ml',
};

function normalizeBarcodeInput(str: string): string {
  return str
    .split('')
    .map(ch => HANGUL_TO_ENG[ch] ?? ch)
    .filter(ch => !/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(ch))
    .join('')
    .toUpperCase();
}

export default function TransactionModal({ isOpen, onClose, onSuccess }: TransactionModalProps) {
  const { data: session } = useSession();
  const isEmployee = (session?.user as any)?.role === "employee";
  const { t } = useT();
  const CAT_LABEL: Record<string, string> = {
    "웨이퍼": t.inventory.catWafer,
    "타겟": t.inventory.catTarget,
    "가스": t.inventory.catGas,
    "기자재/소모품": t.inventory.catEquip,
  };
  const isMobile = typeof navigator !== "undefined" &&
    (navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent));

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
  const [quantity, setQuantity]     = useState("");
  const [unitPrice, setUnitPrice]   = useState("");
  const [partnerId, setPartnerId]   = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [selectedPartnerContact, setSelectedPartnerContact] = useState<{ contact: string | null; email: string | null; managerName: string | null } | null>(null);
  const [currency, setCurrency]     = useState<"KRW" | "USD">("KRW");
  const [exchangeRateAtEntry, setExchangeRateAtEntry] = useState<number | null>(null);
  const [memo, setMemo]             = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  const [txReasonId, setTxReasonId] = useState<number | null>(null);
  const [txReasonOptions, setTxReasonOptions] = useState<TxReasonOption[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [disburseeId, setDisburseeId] = useState<number | null>(null);

  const [itemOptions, setItemOptions]         = useState<ItemOption[]>([]);
  const [partnerOptions, setPartnerOptions]   = useState<PartnerOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [locationId, setLocationId]           = useState<number>(1);
  const [showItemSelector, setShowItemSelector] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const inboundModalBarcodeId = useRef<number | null>(null);
  const isFromLookupRef = useRef(false);
  const isComposingRef = useRef(false);
  const justCreatedBarcodeId = useRef<number | null>(null);
  const cancelCreatedBarcode = () => {
    if (justCreatedBarcodeId.current !== null) {
      fetch(`/api/barcodes?id=${justCreatedBarcodeId.current}`, { method: "DELETE" }).catch(() => {});
      justCreatedBarcodeId.current = null;
    }
  };

  // 바코드 선택기
  const [showBarcodeSelector, setShowBarcodeSelector] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [barcodeSelectorSearch, setBarcodeSelectorSearch] = useState("");
  const [barcodeSelectorList, setBarcodeSelectorList]     = useState<BarcodeOption[]>([]);
  const [barcodeSelectorLoading, setBarcodeSelectorLoading] = useState(false);
  const [isBarcodeLooking, setIsBarcodeLooking] = useState(false);
  const [showBarcodeCreate, setShowBarcodeCreate] = useState(false);
  const [barcodeCreateMaterial, setBarcodeCreateMaterial] = useState("");
  const [barcodeCreating, setBarcodeCreating] = useState(false);
  const [barcodeCreateError, setBarcodeCreateError] = useState("");

  // 웨이퍼 스펙
  const [waferSpec, setWaferSpec] = useState<WaferSpecInfo | null>(null);

  // 입고 참조 선택
  const [showInboundSelect, setShowInboundSelect] = useState(false);
  const [selectedInbound, setSelectedInbound] = useState<SelectedInbound | null>(null);

  // 위치별 재고 수량
  const [stockMap, setStockMap] = useState<Map<number, number>>(new Map());

  // currency 변경 시 환율 자동 조회
  useEffect(() => {
    if (currency === "USD") {
      fetch("/api/exchange-rate")
        .then(r => r.json())
        .then(data => setExchangeRateAtEntry(data.rate))
        .catch(() => {});
    } else {
      setExchangeRateAtEntry(null);
    }
  }, [currency]);

  // 모달 열릴 때 거래처 + 위치 로드 (한 번만)
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/partners")
      .then(r => r.json()).then(setPartnerOptions)
      .catch(() => setError(t.tx.partnerLoadFailed));
    fetch("/api/tx-reasons")
      .then(r => r.json()).then(setTxReasonOptions)
      .catch(() => {});
    fetch("/api/users")
      .then(r => r.json()).then(setUserOptions)
      .catch(() => {});
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
      })
      .catch(() => setError(t.tx.locationLoadFailed));
  }, [isOpen]);

  // 모달 닫힐 때 전체 폼 초기화
  useEffect(() => {
    if (!isOpen) {
      setType("입고"); setCategory("웨이퍼"); setDate(new Date().toISOString().split("T")[0]);
      setItemId(null); setItemCode(""); setItemName("");
      setBarcodeInput(""); setBarcodeId(null); setTargetUnitId(null); setRefTxNo(null);
      setShowCameraScanner(false);
      setQuantity(""); setUnitPrice("");
      setPartnerId(null); setPartnerName(""); setSelectedPartnerContact(null);
      setLocationId(1);
      setCurrency("KRW");
      setExchangeRateAtEntry(null);
      setMemo(""); setError(""); setShowItemSelector(false);
      setShowBarcodeSelector(false); setBarcodeSelectorSearch(""); setBarcodeSelectorList([]);
      setWaferSpec(null);
      setShowInboundSelect(false); setSelectedInbound(null);
      setTxReasonId(null);
      setDisburseeId(null);
      setStockMap(new Map());
      setShowBarcodeCreate(false);
      setBarcodeCreateMaterial("");
      setBarcodeCreating(false);
      setBarcodeCreateError("");
    }
  }, [isOpen]);

  // isOpen 또는 locationId 변경 시 재고 수량 조회
  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/status?locationId=${locationId}`)
      .then(r => r.json())
      .then((data: { id: number; currentQty: number }[]) => {
        const map = new Map(data.map(d => [d.id, d.currentQty]));
        setStockMap(map);
      })
      .catch(() => {});
  }, [isOpen, locationId]);

  // 품목군 바뀔 때 품목 목록 새로 로드 + 선택 초기화
  useEffect(() => {
    if (!isOpen) return;
    if (isFromLookupRef.current) {
      isFromLookupRef.current = false;
      return;
    }
    fetch(`/api/items?category=${encodeURIComponent(category)}`)
      .then(r => r.json())
      .then(setItemOptions)
      .catch(() => setError(t.tx.itemLoadFailed));
    setItemId(null); setItemCode(""); setItemName("");
    setShowItemSelector(false);
    setWaferSpec(null);
    setSelectedInbound(null);
  }, [category, isOpen]);

  // 웨이퍼 품목 선택 시 스펙 조회
  useEffect(() => {
    if (category !== "웨이퍼" || !itemId || !isOpen) { setWaferSpec(null); return; }
    fetch(`/api/items/${itemId}/spec`)
      .then(r => r.json())
      .then(data => setWaferSpec(data?.waferSpec ?? null))
      .catch(() => setWaferSpec(null));
  }, [itemId, category, isOpen]);

  // 모달 열릴 때 바코드 input 자동 포커스
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => barcodeInputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node))
        setShowItemSelector(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 바코드 목록 선택기 열기
  const openBarcodeSelector = async () => {
    setShowBarcodeSelector(true);
    setBarcodeSelectorSearch(barcodeInput.trim());
    setBarcodeSelectorLoading(true);
    try {
      const res = await fetch(`/api/barcodes?category=${encodeURIComponent(category)}`);
      if (res.ok) {
        const all: BarcodeOption[] = await res.json();
        setBarcodeSelectorList(all.filter(b => b.isActive !== "N"));
      }
    } catch { /* ignore */ }
    finally { setBarcodeSelectorLoading(false); }
  };

  // 바코드 조회 — 출고/불출: /lookup (refTxNo 포함), 입고: /barcodes?search
  // codeOverride: 목록 선택 시 직접 코드 전달 (state 비동기 문제 우회)
  const handleBarcodeLookup = async (codeOverride?: string) => {
    const lookupCode = (codeOverride ?? barcodeInput).trim();
    if (!lookupCode) return;
    setError("");
    setSelectedInbound(null);
    setRefTxNo(null);
    setIsBarcodeLooking(true);
    try {
      if (type === "출고" || type === "불출") {
        const res = await fetch(`/api/barcodes/lookup?code=${encodeURIComponent(lookupCode)}`);
        const bc = await res.json();
        if (!res.ok) { setError(bc.error || t.tx.barcodeLookupFailed); barcodeInputRef.current?.focus(); return; }
        setBarcodeId(bc.barcodeId);
        setTargetUnitId(bc.targetUnitId ?? null);
        setRefTxNo(bc.refTxNo ?? null);
        if (bc.category && bc.category !== category) {
          // setCategory → category useEffect가 setItemCode/setItemName을 "" 로 초기화함
          // await 이후에 덮어써야 하므로 setItemCode/setItemName은 아래로 이동
          isFromLookupRef.current = true;
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
        // refTxNo가 있으면 inbound API 호출해서 selectedInbound 자동 채우기
        if (bc.refTxNo) {
          const itemIdToUse = bc.itemId ?? itemId;
          fetch(`/api/inventory/inbound?itemId=${itemIdToUse}&locationId=${locationId}&barcodeId=${bc.barcodeId}`)
            .then(r => r.json())
            .then((list: InboundTx[]) => {
              const found = list.find(tx => tx.txNo === bc.refTxNo);
              if (found) {
                setSelectedInbound({
                  txNo: found.txNo,
                  txDate: found.txDate,
                  remainQty: found.remainQty,
                  barcodeId: found.barcodeId,
                  targetUnitId: found.targetUnitId,
                  partnerName: found.partnerName,
                  itemCode:    found.itemCode    ?? "",
                  barcodeCode: found.barcodeCode ?? "",
                });
              }
            })
            .catch(() => {});
        }
      } else {
        // 입고: 정확한 바코드 조회 (출고/불출과 동일한 lookup API 사용)
        const res = await fetch(`/api/barcodes/lookup?code=${encodeURIComponent(lookupCode)}`);
        const bc = await res.json();
        if (!res.ok) { setError(bc.error ?? t.tx.barcodeLookupFailed); barcodeInputRef.current?.focus(); return; }
        setBarcodeId(bc.barcodeId);
        setTargetUnitId(bc.targetUnitId ?? null);
        if (bc.category && bc.category !== category) {
          // setCategory → category useEffect가, setItemCode/setItemName을 "" 로 초기화
          // await 이전에 먼저 하면, setItemCode/setItemName이 날려 이후
          isFromLookupRef.current = true;
          setCategory(bc.category);
          const items = await fetch(`/api/items?category=${encodeURIComponent(bc.category)}`).then(r => r.json()).then((r: ItemOption[]) => { setItemOptions(r); return r; });
          setItemOptions(items);
          const found = items.find((i: ItemOption) => i.id === bc.itemId);
          if (found) setItemId(found.id);
        } else {
          if (bc.itemId) setItemId(bc.itemId);
        }
        // useEffect([category])가, 카테고리 바뀔 때 실행
        setItemCode(bc.itemCode);
        setItemName(bc.itemName);
      }
    } catch { setError(t.tx.barcodeLookupFailed); barcodeInputRef.current?.focus(); }
    finally { setIsBarcodeLooking(false); }
  };

  // 입고 참조 선택 콜백
  const handleInboundSelect = (inbound: InboundTx) => {
    setRefTxNo(inbound.txNo);
    setSelectedInbound({
      txNo: inbound.txNo,
      txDate: inbound.txDate,
      remainQty: inbound.remainQty,
      barcodeId: inbound.barcodeId,
      targetUnitId: inbound.targetUnitId,
      partnerName: inbound.partnerName,
      itemCode:    inbound.itemCode    ?? "",
      barcodeCode: inbound.barcodeCode ?? "",
    });
    if (inbound.barcodeId)    setBarcodeId(inbound.barcodeId);
    if (inbound.targetUnitId) setTargetUnitId(inbound.targetUnitId);
  };

  // 인라인 바코드 생성
  const handleBarcodeCreate = async () => {
    if (!itemId) { setBarcodeCreateError(t.tx.selectItemFirst); return; }
    setBarcodeCreating(true);
    setBarcodeCreateError("");
    try {
      const res = await fetch("/api/barcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, materialName: barcodeCreateMaterial || null }),
      });
      const data = await res.json();
      if (!res.ok) { setBarcodeCreateError((data.error || t.common.saveFail) + (data.detail ? `\n${data.detail}` : "")); return; }
      // 생성된 바코드를 자동으로 입력란에 채우고 조회
      setBarcodeInput(data.code);
      justCreatedBarcodeId.current = data.id;
      setShowBarcodeCreate(false);
      setBarcodeCreateMaterial("");
      await handleBarcodeLookup(data.code);
    } catch { setBarcodeCreateError(t.common.networkError); }
    finally { setBarcodeCreating(false); }
  };

  // 금액 자동계산
  const amount = Number(quantity || 0) * Number(unitPrice || 0);

  // 저장
  const handleSave = async () => {
    if (!itemId)                            { setError(t.tx.selectItem);  barcodeInputRef.current?.focus(); return; }
    if (!quantity || Number(quantity) <= 0) { setError(t.tx.enterQty);   barcodeInputRef.current?.focus(); return; }
    // 출고/불출 시 참조 입고건 필수
    if ((type === "출고" || type === "불출") && !refTxNo) {
      setError(t.tx.selectInbound);
      return;
    }
    // 수량 초과 시 저장 차단
    if ((type === "출고" || type === "불출") && selectedInbound) {
      if (Number(quantity) > selectedInbound.remainQty) {
        setError(t.tx.qtyExceeded(selectedInbound.remainQty));
        barcodeInputRef.current?.focus(); return;
      }
    }
    // 출고/불출 시 바코드 필수 검증
    if ((type === "출고" || type === "불출") && !barcodeId) {
      try {
        const res = await fetch(`/api/barcodes?itemId=${itemId}&activeOnly=true`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setError(t.tx.barcodeRequired);
          barcodeInputRef.current?.focus(); return;
        }
      } catch {
        // 조회 실패 시 API에서 검증하므로 통과
      }
    }
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
          partnerId: type === "불출" ? null : (partnerId || null),
          txReasonId: txReasonId || null,
          disburseeUserId: type === "불출" ? (disburseeId || null) : null,
          memo:      memo || null,
          barcodeId:    barcodeId    || null,
          targetUnitId: targetUnitId || null,
          refTxNo:      refTxNo      || null,
          currency:     currency,
          exchangeRateAtEntry: currency === "USD" ? exchangeRateAtEntry : null,
          locationId:   locationId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || t.common.saveFail); barcodeInputRef.current?.focus(); return;
      }
      onSuccess?.();
      justCreatedBarcodeId.current = null;
      onClose();
    } catch {
      setError(t.common.networkError); barcodeInputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // 바코드 선택기 검색 필터
  const filteredBarcodes = barcodeSelectorList.filter(b => {
    if (!barcodeSelectorSearch) return true;
    const s = barcodeSelectorSearch.toLowerCase();
    return b.code.toLowerCase().includes(s) ||
           b.itemCode.toLowerCase().includes(s) ||
           b.itemName.toLowerCase().includes(s);
  });

  return (
    <>
    {/* 입고 참조 선택 모달 */}
    <InboundSelectModal
      isOpen={showInboundSelect}
      itemId={itemId}
      barcodeId={inboundModalBarcodeId.current}
      onSelect={handleInboundSelect}
      onClose={() => setShowInboundSelect(false)}
    />
    {/* 바코드 선택기 팝업 */}
    {showBarcodeSelector && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-sm">{t.tx.barcodeSelectorTitle(category)}</h3>
            <button onClick={() => setShowBarcodeSelector(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} className="text-gray-400" />
            </button>
          </div>
          <div className="px-4 py-3 border-b border-gray-100">
            <input
              type="text"
              placeholder={t.tx.barcodeSelectorSearch}
              value={barcodeSelectorSearch}
              onChange={e => setBarcodeSelectorSearch(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {barcodeSelectorLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-blue-500" />
              </div>
            ) : filteredBarcodes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">{t.tx.noBarcodes}</p>
            ) : filteredBarcodes.map(b => (
              <button key={b.id}
                onClick={() => {
                  setBarcodeInput(b.code);
                  setShowBarcodeSelector(false);
                  handleBarcodeLookup(b.code);
                }}
                className="w-full text-left px-5 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors">
                <div className="flex items-center justify-between w-full">
                  <div>
                    <p className="text-sm font-mono font-semibold text-gray-900">{b.code}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{b.itemName} <span className="text-gray-400 font-mono">· {b.itemCode}</span></p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-2 shrink-0 ${
                    b.remainQty > 0
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-gray-100 text-gray-400"
                  }`}>
                    {b.remainQty.toLocaleString()}개
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <p className="text-xs text-gray-400">{filteredBarcodes.length}{t.target.countUnit}</p>
          </div>
        </div>
      </div>
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{t.tx.newRecord}</h2>
          <button onClick={() => { cancelCreatedBarcode(); onClose(); }} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* 구분 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tx.typeLabel}</label>
            <div className="flex gap-2">
              {(["입고", "출고", "불출"] as const).map((tp) => (
                <button key={tp} onClick={() => {
                  cancelCreatedBarcode();
                  setType(tp);
                  setItemId(null); setItemCode(""); setItemName("");
                  setBarcodeInput(""); setBarcodeId(null); setTargetUnitId(null);
                  setRefTxNo(null); setSelectedInbound(null);
                  setQuantity(""); setUnitPrice("");
                  setPartnerId(null); setPartnerName("");
                  setTxReasonId(null); setDisburseeId(null);
                  setMemo(""); setWaferSpec(null); setError("");
                  setShowBarcodeCreate(false);
                  setBarcodeCreateMaterial("");
                  setBarcodeCreateError("");
                  setShowCameraScanner(false);
                }}
                  className={`flex-1 py-2 sm:py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    type === tp
                      ? `${TYPE_COLORS[tp].bg} ${TYPE_COLORS[tp].text} ${TYPE_COLORS[tp].border} border-2 shadow-sm`
                      : "bg-gray-50 text-gray-500 border-2 border-transparent hover:bg-gray-100"
                  }`}>{tp}</button>
              ))}
            </div>
          </div>

          {/* 날짜 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tx.dateLabel}</label>
            <DatePicker
              value={date}
              onChange={val => setDate(val)}
              placeholder="날짜 선택"
              className="w-full"
            />
          </div>

          {/* 바코드 — 입고/출고/불출 모두 표시 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-semibold text-gray-700">{t.tx.barcodeLabel}</label>
              <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                {t.tx.scannerBadge}
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                disabled={isBarcodeLooking}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={e => {
                  isComposingRef.current = false;
                  setBarcodeInput(normalizeBarcodeInput((e.target as HTMLInputElement).value));
                }}
                onChange={e => {
                  if (isComposingRef.current) return;
                  setBarcodeInput(normalizeBarcodeInput(e.target.value));
                }}
                onKeyDown={e => e.key === "Enter" && handleBarcodeLookup()}
                placeholder={t.tx.barcodePlaceholder}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
              />
              {isBarcodeLooking && (
                <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                  <Loader2 size={14} className="animate-spin text-blue-500" />
                  <span className="text-xs text-blue-500 whitespace-nowrap">{t.tx.lookingUp}</span>
                </div>
              )}
              </div>
              <button onClick={() => handleBarcodeLookup()}
                className="shrink-0 px-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors whitespace-nowrap">
                {t.tx.lookupBtn}
              </button>
              <button onClick={openBarcodeSelector}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors whitespace-nowrap"
                title="바코드 목록에서 선택">
                <List size={15} />{t.tx.listBtn}
              </button>
              {type === "입고" && !showCameraScanner && (
                <button onClick={() => { setShowBarcodeCreate(v => !v); setBarcodeCreateError(""); }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors whitespace-nowrap"
                  title="새 바코드 생성">
                  <Plus size={15} />{t.tx.createBtn}
                </button>
              )}
            </div>
            {/* 카메라 버튼 — 모바일만 표시 */}
            {isMobile && (
              <div className="flex gap-2 mt-1.5">
                <button onClick={() => setShowCameraScanner(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    showCameraScanner
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}>
                  <Camera size={12} />{t.tx.cameraBtn}
                </button>
              </div>
            )}
            {isMobile && showCameraScanner && (
              <BarcodeCameraScanner
                onDetected={(code) => {
                  setBarcodeInput(code);
                  setShowCameraScanner(false);
                  handleBarcodeLookup(code);
                }}
                onClose={() => setShowCameraScanner(false)}
              />
            )}
            <p className="mt-1.5 text-xs text-gray-400">{t.tx.barcodeHint}</p>
            {error && (
              <div className="flex items-center gap-2 mt-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
                <span className="text-xs text-red-500 font-medium">⚠️ {error}</span>
                <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600">
                  <X size={14} />
                </button>
              </div>
            )}
            {/* 타겟 ID 연결 안내 */}
            {targetUnitId && (
              <span className="inline-flex items-center mt-1.5 gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700">
                {t.tx.targetLinked(String(targetUnitId).padStart(3, "0"))}
              </span>
            )}
            {/* 입고: 인라인 바코드 생성 폼 */}
            {type === "입고" && showBarcodeCreate && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-blue-700">{t.tx.createBarcodeTitle}</p>
                {category === "타겟" && (
                  <input type="text" value={barcodeCreateMaterial}
                    onChange={e => setBarcodeCreateMaterial(e.target.value)}
                    placeholder={t.tx.materialPlaceholder}
                    className="w-full px-3 py-2 border border-blue-200 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-blue-400" />
                )}
                {barcodeCreateError && (
                  <p className="text-xs text-red-500 whitespace-pre-line">{barcodeCreateError}</p>
                )}
                {!itemId && (
                  <p className="text-xs text-amber-600 mt-1">
                    {t.tx.selectItemHint}
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={handleBarcodeCreate} disabled={barcodeCreating || !itemId}
                    className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                    {barcodeCreating ? t.barcode.creating : t.tx.createAndLink}
                  </button>
                  <button onClick={() => { setShowBarcodeCreate(false); setBarcodeCreateError(""); }}
                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200">
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            )}
            {/* 출고/불출: 입고 참조 선택 */}
            {(type === "출고" || type === "불출") && (
              <div className="mt-2">
                {selectedInbound ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                    <div className="flex-1 text-xs space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-700">#{selectedInbound.txNo}</span>
                        {selectedInbound.itemCode && (
                          <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded ml-1">
                            {selectedInbound.itemCode}
                          </span>
                        )}
                        <span className="text-emerald-500">{selectedInbound.txDate}</span>
                        {selectedInbound.partnerName && (
                          <span className="text-emerald-500">· {selectedInbound.partnerName}</span>
                        )}
                      </div>
                      <p className="text-emerald-400">{t.tx.remainQty(selectedInbound.remainQty)}</p>
                    </div>
                    <button onClick={() => { inboundModalBarcodeId.current = barcodeId; setShowInboundSelect(true); }}
                      className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">
                      {t.tx.changeBtn}
                    </button>
                  </div>
                ) : refTxNo ? (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-blue-600 font-medium">{t.tx.inboundRef(refTxNo!)}</p>
                    <button
                      onClick={() => { inboundModalBarcodeId.current = barcodeId; setShowInboundSelect(true); }}
                      className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      {t.tx.changeBtn}
                    </button>
                  </div>
                ) : itemId ? (
                  <button onClick={() => { inboundModalBarcodeId.current = barcodeId; setShowInboundSelect(true); }}
                    className="mt-1 text-xs px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors">
                    {t.tx.selectInbound}
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* 품목군 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{t.items.catLabel}</label>
            <div className="flex gap-2 flex-wrap">
              {["웨이퍼", "타겟", "가스", "기자재/소모품"].map((c) => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    category === c
                      ? `${CATEGORY_COLORS[c]} shadow-sm ring-1 ring-gray-200`
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}>{CAT_LABEL[c] || c}</button>
              ))}
            </div>
          </div>

          {/* 품목코드 / 품목명 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.items.itemCodeLabel}</label>
              <div className="relative" ref={selectorRef}>
                <div className="flex gap-2">
                  <input value={itemCode} readOnly placeholder={t.barcode.autoFill}
                    className="flex-1 min-w-0 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                  <button
                    onClick={() => setShowItemSelector(v => !v)}
                    className="px-3 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors whitespace-nowrap">
                    {t.barcode.selectBtn}
                  </button>
                </div>
                {showItemSelector && (
                  <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {itemOptions.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400">{t.tx.noItemsInCat}</p>
                    ) : (
                      itemOptions.map(opt => (
                        <button key={opt.id}
                          onClick={() => {
                            cancelCreatedBarcode();
                            setItemId(opt.id); setItemCode(opt.code); setItemName(opt.name);
                            // 직접 선택 시 바코드/타겟/입고참조 해제
                            setBarcodeInput("");
                            setBarcodeId(null); setTargetUnitId(null); setRefTxNo(null); setSelectedInbound(null);
                            setShowItemSelector(false);
                            // 출고/불출: 입고 참조 선택 자동 오픈
                            if (type === "출고" || type === "불출") { inboundModalBarcodeId.current = barcodeId; setShowInboundSelect(true); }
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                          <div className="flex items-center justify-between w-full">
                            <div>
                              <span className="font-medium text-gray-900">{opt.name}</span>
                              <span className="ml-2 text-xs text-gray-400 font-mono">{opt.code}</span>
                            </div>
                            {stockMap.has(opt.id) && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-2 shrink-0 ${
                                (stockMap.get(opt.id) ?? 0) > 0
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-gray-100 text-gray-400"
                              }`}>
                                {(stockMap.get(opt.id) ?? 0).toLocaleString()}개
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.items.itemNameLabel}</label>
              <input value={itemName} readOnly placeholder={t.barcode.autoFill}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          {/* 웨이퍼 스펙 정보 (웨이퍼 품목 선택 시만 표시) */}
          {category === "웨이퍼" && itemId && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">{t.tx.waferSpecTitle}</p>
              {waferSpec ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-blue-800">
                  <span><span className="text-blue-400">{t.tx.waferDiam}: </span>{waferSpec.diameterInch ? `${waferSpec.diameterInch}"` : "-"}</span>
                  <span><span className="text-blue-400">{t.tx.waferType}: </span>{waferSpec.waferType || "-"}</span>
                  <span><span className="text-blue-400">{t.tx.waferResist}: </span>{waferSpec.resistivity || "-"}</span>
                  <span><span className="text-blue-400">{t.tx.waferThick}: </span>{waferSpec.thicknessNote || "-"}</span>
                  <span><span className="text-blue-400">{t.tx.waferOrient}: </span>{waferSpec.orientation || "-"}</span>
                  <span><span className="text-blue-400">{t.tx.waferSurface}: </span>{waferSpec.surface || "-"}</span>
                </div>
              ) : (
                <p className="text-xs text-blue-400">{t.tx.noSpec}</p>
              )}
            </div>
          )}

          {/* 수량 / 단가 / 금액 */}
          <div className="flex justify-end">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["KRW", "USD"] as const).map(c => (
                <button key={c} type="button" onClick={() => setCurrency(c)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    currency === c
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}>
                  {c === "KRW" ? "₩ KRW" : "$ USD"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tx.qtyLabel} <span className="text-rose-500">*</span></label>
              <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tx.unitPriceLabel}</label>
              <input type="text" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                placeholder={currency === "USD" ? "$0.00" : "₩0"}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tx.amountLabel}</label>
              <input type="text" value={amount ? (currency === "USD" ? `$${amount.toLocaleString()}` : `₩${amount.toLocaleString()}`) : ""} readOnly placeholder={t.tx.autoCalc}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          {currency === "USD" && (
            <div className="flex items-center gap-2 -mt-2">
              <p className="text-xs text-gray-400 shrink-0">{t.tx.rateLabel}</p>
              <input
                type="number"
                value={exchangeRateAtEntry ?? ""}
                onChange={e => setExchangeRateAtEntry(Number(e.target.value) || null)}
                placeholder={t.period.exchangeRatePlaceholder}
                className="w-28 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-700 outline-none focus:ring-1 focus:ring-blue-400"
              />
              <p className="text-xs text-gray-400 shrink-0">{t.tx.rateUnit}</p>
            </div>
          )}

          {/* 잔여수량 초과 경고 */}
          {(type === "출고" || type === "불출") && selectedInbound && quantity && Number(quantity) > selectedInbound.remainQty && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
              {t.tx.qtyWarning(quantity, selectedInbound.remainQty)}
            </p>
          )}

          {/* 거래처 — 입고/출고만 표시 */}
          {type !== "불출" && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tx.partnerLabel}</label>
              <select value={partnerId ?? ""} onChange={e => {
                const id = Number(e.target.value);
                setPartnerId(id || null);
                const found = partnerOptions.find(p => p.id === id);
                setPartnerName(found?.name || "");
                setSelectedPartnerContact(found ? {
                  contact:     found.contact     ?? null,
                  email:       found.email       ?? null,
                  managerName: found.managerName ?? null,
                } : null);
              }} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                <option value="">{t.items.selectPlaceholder}</option>
                {partnerOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedPartnerContact && partnerId && (
                <div className="mt-1.5 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600 space-y-0.5">
                  {selectedPartnerContact.managerName && (
                    <div>{t.tx.managerInfo}: <span className="font-medium text-gray-800">{selectedPartnerContact.managerName}</span></div>
                  )}
                  {selectedPartnerContact.contact && (
                    <div>{t.tx.contactInfo}: <span className="font-medium text-gray-800">{selectedPartnerContact.contact}</span></div>
                  )}
                  {selectedPartnerContact.email && (
                    <div>{t.tx.emailInfo}: <span className="font-medium text-gray-800">{selectedPartnerContact.email}</span></div>
                  )}
                  {!selectedPartnerContact.managerName && !selectedPartnerContact.contact && !selectedPartnerContact.email && (
                    <div className="text-gray-400">{t.tx.noContactInfo}</div>
                  )}
                  <div className="pt-0.5 text-gray-400">
                    {t.tx.contactEditHint}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 불출처 + 사용목적 — 불출만 표시 */}
          {type === "불출" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tx.disburseeLabel} <span className="text-rose-500">*</span></label>
                <select value={disburseeId ?? ""} onChange={e => setDisburseeId(Number(e.target.value) || null)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                  <option value="">{t.tx.selectUser}</option>
                  {userOptions.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tx.disburseTypeLabel}</label>
                <select value={txReasonId ?? ""} onChange={e => setTxReasonId(Number(e.target.value) || null)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                  <option value="">{t.items.selectPlaceholder}</option>
                  {txReasonOptions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* 위치 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t.tx.locationLabel} <span className="text-rose-500">*</span>
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">{t.items.noteLabel}</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)}
              placeholder={t.tx.memoPlaceholder} rows={2}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
          </div>

        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            {t.common.cancel}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 text-sm font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-60">
            {saving ? t.common.saving : t.common.save}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
