"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import DatePicker from "./DatePicker";
import { useT } from "@/lib/i18n";
import { exportCSV } from "@/lib/csvUtils";

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
  partner:      "bg-sky-100 text-sky-700",
  item:         "bg-teal-100 text-teal-700",
  barcode:      "bg-orange-100 text-orange-700",
  chamber_slot: "bg-pink-100 text-pink-700",
  user:         "bg-indigo-100 text-indigo-700",
  target_unit:  "bg-yellow-100 text-yellow-700",
};

function parseDiff(detail: string): Array<{ field: string; from: string; to: string }> | null {
  if (!detail || !detail.includes(" → ")) return null;
  return detail.split(" | ").map(item => {
    const colonIdx = item.indexOf(": ");
    if (colonIdx === -1) return { field: "", from: "", to: item };
    const field = item.slice(0, colonIdx);
    const rest = item.slice(colonIdx + 2);
    const arrowIdx = rest.indexOf(" → ");
    if (arrowIdx === -1) return { field, from: rest, to: "" };
    return { field, from: rest.slice(0, arrowIdx), to: rest.slice(arrowIdx + 3) };
  });
}

const PAGE_LIMIT = 50;

export default function LogPage() {
  const { t } = useT();

  const TABLE_LABELS: { key: string; label: string }[] = [
    { key: "inventory_tx", label: t.logs.tblInventory },
    { key: "target_log",   label: t.logs.tblTarget },
    { key: "partner",      label: t.logs.tblPartner },
    { key: "item",         label: t.logs.tblItem },
    { key: "barcode",      label: t.logs.tblBarcode },
    { key: "chamber_slot", label: t.logs.tblChamber },
    { key: "user",         label: t.logs.tblUser },
    { key: "target_unit",  label: t.logs.tblTargetUnit },
  ];

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
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

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

  // 필터 변경 시 자동 로드 (초기 진입 포함)
  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchLogs(p);
  };

  // CSV 내보내기
  const handleExport = () => {
    if (logs.length === 0) return;
    exportCSV(t.logs.csvHeaders, logs.map(l => [
      new Date(l.createdAt).toLocaleString("ko-KR"),
      l.userName,
      l.tableLabel,
      l.actionLabel,
      String(l.recordId),
      l.detail,
    ]), `activity_log_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const toggleAction = (v: string) => setAction(prev => prev === v ? "" : v);
  const toggleTable  = (v: string) => setTableName(prev => prev === v ? "" : v);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t.nav.logs}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t.logs.subtitle}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={logs.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={15} />CSV
        </button>
      </div>

      {/* 필터 카드 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        {/* 날짜 + 작업자 */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t.logs.startDate}</label>
            <DatePicker
              value={startDate}
              onChange={val => setStartDate(val)}
              placeholder="시작일"
              className="w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t.logs.endDate}</label>
            <DatePicker
              value={endDate}
              onChange={val => setEndDate(val)}
              placeholder="종료일"
              className="w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t.logs.workerLabel}</label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[120px]"
            >
              <option value="">{t.logs.allWorkers}</option>
              {users.map(u => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 액션 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs font-semibold text-gray-400 self-center mr-1 shrink-0">{t.logs.actionFilterLabel}</span>
          {(["CREATE", "UPDATE", "DELETE"] as const).map(a => (
            <button
              key={a}
              onClick={() => toggleAction(a)}
              className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                action === a
                  ? ACTION_COLORS[a]
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {a === "CREATE" ? t.logs.actionCreate : a === "UPDATE" ? t.logs.actionUpdate : t.logs.actionDelete}
            </button>
          ))}
          <span className="text-xs font-semibold text-gray-400 self-center mx-1 shrink-0">|</span>
          <span className="text-xs font-semibold text-gray-400 self-center mr-1 shrink-0">{t.logs.tableFilterLabel}</span>
          {TABLE_LABELS.map(tbl => (
            <button key={tbl.key} onClick={() => toggleTable(tbl.key)}
              className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                tableName === tbl.key ? TABLE_COLORS[tbl.key] : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}>
              {tbl.label}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 수 */}
      <div className="flex items-center justify-between text-sm text-gray-500 px-1">
        <span>{t.logs.totalCount(total)}</span>
        {totalPages > 1 && (
          <span>{t.logs.pageInfo(page, totalPages)}</span>
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
            <p className="text-sm">{t.logs.noData}</p>
          </div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{t.logs.colTime}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{t.logs.colWorker}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{t.logs.colTable}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{t.logs.colAction}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{t.logs.colDetail}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => {
                    const parsed = log.action === "UPDATE" ? parseDiff(log.detail) : null;
                    const isExpanded = expandedLogId === log.id;
                    return (
                      <Fragment key={log.id}>
                        <tr className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setExpandedLogId(prev => prev === log.id ? null : log.id)}>
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
                          <td className="px-4 py-3 text-gray-600">
                            {parsed ? (
                              <span className="text-xs">
                                {parsed[0].field}: {parsed[0].from} → {parsed[0].to}
                                {parsed.length > 1 && (
                                  <span className="text-gray-400 ml-1">외 {parsed.length - 1}건</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs">{log.detail || "-"}</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-blue-50/50">
                            <td colSpan={5} className="px-6 py-3">
                              {parsed ? (
                                <table className="text-xs w-full max-w-2xl">
                                  <thead>
                                    <tr className="text-gray-400">
                                      <th className="text-left pb-1 pr-8 font-medium w-32">항목</th>
                                      <th className="text-left pb-1 pr-8 font-medium">이전</th>
                                      <th className="text-left pb-1 font-medium">변경 후</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {parsed.map((row, i) => (
                                      <tr key={i} className="border-t border-blue-100">
                                        <td className="py-1 pr-8 font-medium text-gray-600">{row.field}</td>
                                        <td className="py-1 pr-8 text-red-500 line-through">{row.from || "-"}</td>
                                        <td className="py-1 text-green-600 font-medium">{row.to || "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <span className="text-xs text-gray-600 whitespace-pre-wrap">{log.detail || "-"}</span>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-gray-100">
              {logs.map(log => {
                const parsed = log.action === "UPDATE" ? parseDiff(log.detail) : null;
                const isExpanded = expandedLogId === log.id;
                return (
                  <div key={log.id} className="px-4 py-3 space-y-1 cursor-pointer" onClick={() => setExpandedLogId(prev => prev === log.id ? null : log.id)}>
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
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800">{log.userName}</span>
                      {!isExpanded && (
                        <span className="text-xs text-gray-500 text-right">
                          {parsed ? (
                            <>
                              {parsed[0].field}: {parsed[0].from} → {parsed[0].to}
                              {parsed.length > 1 && (
                                <span className="text-gray-400 ml-1">외 {parsed.length - 1}건</span>
                              )}
                            </>
                          ) : (
                            log.detail || "-"
                          )}
                        </span>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-blue-100 bg-blue-50/50 -mx-4 px-4 py-2">
                        {parsed ? (
                          <table className="text-xs w-full">
                            <thead>
                              <tr className="text-gray-400">
                                <th className="text-left pb-1 pr-4 font-medium">항목</th>
                                <th className="text-left pb-1 pr-4 font-medium">이전</th>
                                <th className="text-left pb-1 font-medium">변경 후</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parsed.map((row, i) => (
                                <tr key={i} className="border-t border-blue-100">
                                  <td className="py-1 pr-4 font-medium text-gray-600">{row.field}</td>
                                  <td className="py-1 pr-4 text-red-500 line-through">{row.from || "-"}</td>
                                  <td className="py-1 text-green-600 font-medium">{row.to || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <span className="text-xs text-gray-600 whitespace-pre-wrap">{log.detail || "-"}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
