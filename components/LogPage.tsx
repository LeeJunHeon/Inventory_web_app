"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

interface LogEntry {
  id: number;
  createdAt: string;
  userId: number | null;
  userName: string;
  action: string;
  actionLabel: string;
  tableName: string;
  tableLabel: string;
  recordId: number;
  detail: string;
}

interface UserOption {
  id: number;
  name: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-rose-100 text-rose-700",
};

const TABLE_COLORS: Record<string, string> = {
  inventory_tx: "bg-violet-100 text-violet-700",
  target_log:   "bg-amber-100 text-amber-700",
};

const PAGE_LIMIT = 50;

export default function LogPage() {
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);

  // 필터
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [userId, setUserId]       = useState("");
  const [action, setAction]       = useState("");
  const [tableName, setTableName] = useState("");
  const [users, setUsers]         = useState<UserOption[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchLogs = useCallback(async (p: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate)   params.set("endDate",   endDate);
      if (userId)    params.set("userId",    userId);
      if (action)    params.set("action",    action);
      if (tableName) params.set("tableName", tableName);
      params.set("page",  String(p));
      params.set("limit", String(PAGE_LIMIT));

      const res  = await fetch(`/api/logs?${params}`);
      const json = await res.json();
      setLogs(json.data ?? []);
      setTotal(json.total ?? 0);
      if (json.users) setUsers(json.users);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, userId, action, tableName]);

  // 초기 로드
  useEffect(() => {
    fetchLogs(1);
    setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    setPage(1);
    fetchLogs(1);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchLogs(p);
  };

  // CSV 내보내기
  const handleExport = () => {
    if (logs.length === 0) return;
    const header = ["시각", "작업자", "테이블", "액션", "레코드ID", "상세"];
    const rows = logs.map(l => [
      new Date(l.createdAt).toLocaleString("ko-KR"),
      l.userName,
      l.tableLabel,
      l.actionLabel,
      String(l.recordId),
      l.detail,
    ]);
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleAction = (v: string) => setAction(prev => prev === v ? "" : v);
  const toggleTable  = (v: string) => setTableName(prev => prev === v ? "" : v);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">활동 로그</h2>
          <p className="text-sm text-gray-500 mt-0.5">재고 거래 및 타겟 로그의 등록·수정·삭제 이력</p>
        </div>
        <button
          onClick={handleExport}
          disabled={logs.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          <Download size={15} />
          CSV
        </button>
      </div>

      {/* 필터 카드 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        {/* 날짜 + 작업자 */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">시작일</label>
            <input
              type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">종료일</label>
            <input
              type="date" value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">작업자</label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[120px]"
            >
              <option value="">전체</option>
              {users.map(u => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSearch}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors"
          >
            조회
          </button>
        </div>

        {/* 액션 필터 */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-gray-400 self-center mr-1">액션</span>
          {(["CREATE", "UPDATE", "DELETE"] as const).map(a => (
            <button
              key={a}
              onClick={() => toggleAction(a)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                action === a
                  ? ACTION_COLORS[a]
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {a === "CREATE" ? "등록" : a === "UPDATE" ? "수정" : "삭제"}
            </button>
          ))}
          <span className="text-xs font-semibold text-gray-400 self-center mx-1">|</span>
          <span className="text-xs font-semibold text-gray-400 self-center mr-1">테이블</span>
          {([
            { key: "inventory_tx", label: "재고 거래" },
            { key: "target_log",   label: "타겟 로그" },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => toggleTable(t.key)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                tableName === t.key
                  ? TABLE_COLORS[t.key]
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 수 */}
      <div className="flex items-center justify-between text-sm text-gray-500 px-1">
        <span>총 <span className="font-semibold text-gray-800">{total.toLocaleString()}</span>건</span>
        {totalPages > 1 && (
          <span>{page} / {totalPages} 페이지</span>
        )}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="space-y-px p-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse mb-1" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">조회된 활동 로그가 없습니다.</p>
          </div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">시각</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">작업자</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">테이블</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">액션</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("ko-KR", {
                          year: "numeric", month: "2-digit", day: "2-digit",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{log.userName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-lg ${
                          TABLE_COLORS[log.tableName] ?? "bg-gray-100 text-gray-600"
                        }`}>
                          {log.tableLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-lg ${
                          ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-600"
                        }`}>
                          {log.actionLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{log.detail || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-gray-100">
              {logs.map(log => (
                <div key={log.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-lg ${
                        ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-600"
                      }`}>
                        {log.actionLabel}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-lg ${
                        TABLE_COLORS[log.tableName] ?? "bg-gray-100 text-gray-600"
                      }`}>
                        {log.tableLabel}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(log.createdAt).toLocaleString("ko-KR", {
                        month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{log.userName}</span>
                    <span className="text-xs text-gray-500 truncate max-w-[60%] text-right">{log.detail || "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={16} className="text-gray-600" />
          </button>
          {(() => {
            const range: number[] = [];
            const delta = 2;
            for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
              range.push(i);
            }
            return range.map(p => (
              <button
                key={p}
                onClick={() => handlePageChange(p)}
                className={`w-9 h-9 text-sm rounded-lg font-medium transition-colors ${
                  p === page
                    ? "bg-blue-500 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {p}
              </button>
            ));
          })()}
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>
      )}
    </div>
  );
}
