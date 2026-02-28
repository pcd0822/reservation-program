"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isToday } from "date-fns";
import { ko } from "date-fns/locale";
import { parseCustomFields, parseDateFromSheet } from "@/lib/utils";
import { FileSpreadsheet, FileImage, FileText, Search, CalendarDays, LayoutGrid } from "lucide-react";

type StatusFilter = "all" | "in_progress" | "closed" | "upcoming";

type ScheduleSlot = { date: string; timeLabel?: string };

type ScheduleItem = {
  id: string;
  title: string;
  type: string;
  dateStart: string;
  dateEnd: string;
  timeLabel: string | null;
  maxCapacity: number;
  applyUntil: string | null;
  applyFrom?: string | null;
  customFields: string;
  slots?: ScheduleSlot[];
  _count?: { applications: number };
  slotCounts?: Record<string, number>;
};

type Application = {
  id: string;
  data: string;
  createdAt: string;
  scheduleItem: { id: string; title: string; dateStart: string; timeLabel: string | null };
};

type Props = { tenantId: string };

export function TabApplications({ tenantId }: Props) {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [serverTime, setServerTime] = useState<Date | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<"xlsx" | "pdf" | "image" | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"card" | "calendar">("card");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const load = () => {
    fetch(`/api/schedule?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.schedules ?? [];
        setSchedules(Array.isArray(list) ? list : []);
        setServerTime(data?.serverTime ? new Date(data.serverTime) : null);
      });
    fetch(`/api/application?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => setApplications(Array.isArray(data) ? data : []));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [tenantId]);

  useEffect(() => {
    if (!loading) setLoading(false);
  }, [schedules, applications]);

  const selectedSchedule = selectedItemId ? schedules.find((s) => s.id === selectedItemId) : null;
  const byItem = selectedItemId
    ? applications.filter((a) => a.scheduleItem.id === selectedItemId)
    : [];

  const getScheduleCount = (s: ScheduleItem) => {
    const c = s._count?.applications;
    if (c !== undefined) return c;
    const slotCounts = s.slotCounts;
    if (slotCounts && typeof slotCounts === "object") return Object.values(slotCounts).reduce((a, b) => a + b, 0);
    return 0;
  };

  const now = serverTime ?? new Date();
  const isClosed = (s: ScheduleItem) => {
    const count = getScheduleCount(s);
    if (count >= s.maxCapacity) return true;
    const until = parseDateFromSheet(s.applyUntil);
    if (until != null && now > until) return true;
    return false;
  };

  const isUpcoming = (s: ScheduleItem) => {
    const from = parseDateFromSheet(s.applyFrom);
    return from != null && now < from;
  };

  const isInProgress = (s: ScheduleItem) => !isUpcoming(s) && !isClosed(s);

  const getScheduleStatus = (s: ScheduleItem): "예정" | "진행중" | "마감" =>
    isClosed(s) ? "마감" : isUpcoming(s) ? "예정" : "진행중";

  const formatDateRange = (s: ScheduleItem): string => {
    const slots = s.slots;
    if (slots && slots.length > 1) {
      const dates = slots.map((x) => x.date).filter(Boolean).sort();
      if (dates.length >= 2) {
        return `${format(new Date(dates[0]), "M/d (EEE)", { locale: ko })}~${format(new Date(dates[dates.length - 1]), "M/d (EEE)", { locale: ko })}`;
      }
    }
    if (slots && slots.length === 1 && slots[0].date) {
      return format(new Date(slots[0].date), "M/d (EEE)", { locale: ko });
    }
    const start = s.dateStart;
    const end = s.dateEnd;
    if (start && end && start.slice(0, 10) !== end.slice(0, 10)) {
      return `${format(new Date(start), "M/d (EEE)", { locale: ko })}~${format(new Date(end), "M/d (EEE)", { locale: ko })}`;
    }
    return format(new Date(start || end), "M/d (EEE)", { locale: ko });
  };

  const getItemColor = (s: ScheduleItem) => {
    if (isClosed(s)) return "bg-red-100 border-red-300 text-red-800";
    if (isInProgress(s)) return "bg-pastel-mint/60 border-pastel-mint text-gray-800";
    return "bg-pastel-sky/40 border-pastel-sky text-gray-800";
  };

  const filteredSchedules = useMemo(() => {
    let list = schedules;
    if (statusFilter !== "all") {
      list = list.filter((s) => {
        if (statusFilter === "in_progress") return isInProgress(s);
        if (statusFilter === "closed") return isClosed(s);
        if (statusFilter === "upcoming") return isUpcoming(s);
        return true;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }
    return list;
  }, [schedules, statusFilter, searchQuery]);

  const slotKey = (date: string, timeLabel: string) => `${(date || "").slice(0, 10)}_${timeLabel ?? ""}`;

  const calendarDayData = useMemo(() => {
    const byDate: Record<string, { scheduleId: string; title: string; count: number; maxCapacity: number }[]> = {};
    filteredSchedules.forEach((s) => {
      const slots = s.slots && s.slots.length > 0 ? s.slots : [{ date: s.dateStart?.slice(0, 10) ?? "", timeLabel: s.timeLabel ?? "" }];
      if (slots.length > 0 && s.slotCounts) {
        slots.forEach((slot) => {
          const d = slot.date?.slice(0, 10);
          if (!d) return;
          const cnt = s.slotCounts![slotKey(slot.date ?? "", slot.timeLabel ?? "")] ?? 0;
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push({ scheduleId: s.id, title: s.title, count: cnt, maxCapacity: s.maxCapacity });
        });
      } else {
        const d = (s.dateStart ?? "").slice(0, 10);
        if (!d) return;
        const cnt = getScheduleCount(s);
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push({ scheduleId: s.id, title: s.title, count: cnt, maxCapacity: s.maxCapacity });
      }
    });
    return byDate;
  }, [filteredSchedules]);

  const calendarGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const fields = selectedSchedule ? parseCustomFields(selectedSchedule.customFields) : [];
  const columns = selectedSchedule ? ["신청일시", ...fields.map((f) => f.label)] : [];
  const rows = byItem.map((a) => {
    let data: Record<string, string> = {};
    try {
      data = JSON.parse(a.data) as Record<string, string>;
    } catch {}
    return [
      format(new Date(a.createdAt), "yyyy-MM-dd HH:mm", { locale: ko }),
      ...fields.map((f) => String(data[f.label] ?? "")),
    ];
  });

  const downloadXlsx = async () => {
    setDownloading("xlsx");
    try {
      const mod = await import("xlsx");
      const XLSX = mod.default?.utils ? mod.default : mod;
      const wb = XLSX.utils.book_new();
      const headerRow = columns.length ? columns.map((c) => String(c ?? "")) : ["신청일시"];
      const dataRows = rows.map((row) => row.map((cell) => String(cell ?? "")));
      const wsData = [headerRow, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

      let blob: Blob;
      try {
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      } catch {
        const binary = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
        blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `신청목록_${(selectedSchedule?.title ?? "일정").replace(/[/\\*?:\[\]]/g, "_")}_${format(new Date(), "yyyyMMdd")}.xlsx`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    } catch (e) {
      console.error(e);
      alert("다운로드에 실패했어요.");
    } finally {
      setDownloading(null);
    }
  };

  const downloadPdf = async () => {
    if (!captureRef.current) return;
    setDownloading("pdf");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const imgData = canvas.toDataURL("image/png");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const pxToMm = 25.4 / 96;
      let w = canvas.width * pxToMm;
      let h = canvas.height * pxToMm;
      const scale = Math.min((pageW * 0.95) / w, (pageH * 0.95) / h, 1);
      w *= scale;
      h *= scale;
      doc.addImage(imgData, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
      doc.save(`신청목록_${(selectedSchedule?.title ?? "일정").replace(/[/\\*?:\[\]]/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`);
    } catch (e) {
      console.error(e);
      alert("다운로드에 실패했어요.");
    } finally {
      setDownloading(null);
    }
  };

  const downloadImage = async () => {
    if (!captureRef.current) return;
    setDownloading("image");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `신청목록_${(selectedSchedule?.title ?? "일정").replace(/[/\\*?:\[\]]/g, "_")}_${format(new Date(), "yyyyMMdd")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error(e);
      alert("다운로드에 실패했어요.");
    } finally {
      setDownloading(null);
    }
  };

  const filterBtn = (key: StatusFilter, label: string, color: string) => (
    <button
      type="button"
      onClick={() => setStatusFilter(key)}
      className={`btn-bounce rounded-xl px-4 py-2 text-sm font-medium transition-colors ${statusFilter === key ? color : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="card-soft p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">신청내역 관리</h2>
      <p className="text-sm text-gray-600">
        일정을 클릭하면 해당 일정의 신청자 목록을 테이블로 볼 수 있어요. 마감된 일정은 빨간색으로 표시돼요.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">필터:</span>
          {filterBtn("all", "전체", "bg-gray-300 text-gray-800")}
          {filterBtn("upcoming", "예정", "bg-pastel-sky text-gray-800")}
          {filterBtn("in_progress", "진행중", "bg-pastel-mint text-gray-800")}
          {filterBtn("closed", "마감", "bg-red-200 text-red-800")}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="일정 제목 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border-2 border-pastel-lavender text-sm text-gray-800 placeholder-gray-400 focus:border-pastel-pink focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border-2 border-pastel-lavender p-1 bg-gray-50">
          <button
            type="button"
            onClick={() => setViewMode("card")}
            className={`btn-bounce rounded-lg px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5 ${viewMode === "card" ? "bg-white border border-pastel-lavender shadow-sm text-gray-800" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <LayoutGrid className="w-4 h-4" />
            목록
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`btn-bounce rounded-lg px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5 ${viewMode === "calendar" ? "bg-white border border-pastel-lavender shadow-sm text-gray-800" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <CalendarDays className="w-4 h-4" />
            캘린더
          </button>
        </div>
      </div>

      {viewMode === "card" && (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filteredSchedules.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedItemId(s.id === selectedItemId ? null : s.id)}
            className={`btn-bounce rounded-2xl border-2 p-4 text-left transition-shadow hover:shadow-md ${getItemColor(s)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium truncate flex-1 min-w-0">{s.title}</p>
              <span
                className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${
                  getScheduleStatus(s) === "예정"
                    ? "bg-pastel-sky/80 text-gray-800"
                    : getScheduleStatus(s) === "진행중"
                    ? "bg-pastel-mint text-gray-800"
                    : "bg-red-200 text-red-800"
                }`}
              >
                {getScheduleStatus(s)}
              </span>
            </div>
            <p className="text-sm opacity-90 mt-0.5">
              {formatDateRange(s)}
              {s.timeLabel && !(s.slots && s.slots.length > 1) ? ` ${s.timeLabel}` : ""}
            </p>
            <p className="text-sm mt-1">
              신청 <strong>{getScheduleCount(s)}</strong> / {s.maxCapacity}명
            </p>
          </button>
        ))}
      </div>
      )}

      {viewMode === "calendar" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
              className="btn-bounce rounded-xl px-3 py-2 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              이전 달
            </button>
            <span className="text-lg font-bold text-gray-800">
              {format(calendarMonth, "yyyy년 M월", { locale: ko })}
            </span>
            <button
              type="button"
              onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
              className="btn-bounce rounded-xl px-3 py-2 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              다음 달
            </button>
          </div>
          <div className="rounded-2xl border-2 border-pastel-lavender overflow-hidden bg-white">
            <div className="grid grid-cols-7 border-b border-pastel-lavender bg-gray-50">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-600">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr min-h-[320px]">
              {calendarGrid.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const inMonth = isSameMonth(day, calendarMonth);
                const items = calendarDayData[dateStr] ?? [];
                return (
                  <div
                    key={dateStr}
                    className={`min-h-[80px] border-b border-r border-pastel-lavender/50 p-1.5 ${inMonth ? "bg-white" : "bg-gray-50/80"}`}
                  >
                    <span className={`text-sm font-medium ${inMonth ? (isToday(day) ? "text-pastel-pink" : "text-gray-700") : "text-gray-400"}`}>
                      {format(day, "d")}
                    </span>
                    <div className="mt-0.5 space-y-0.5 overflow-y-auto max-h-[calc(100%-1.25rem)]">
                      {items.map((item) => (
                        <button
                          key={item.scheduleId + dateStr}
                          type="button"
                          onClick={() => setPendingScheduleId((prev) => (prev === item.scheduleId ? null : item.scheduleId))}
                          className={`w-full text-left rounded-lg px-1.5 py-0.5 text-xs truncate border transition-colors ${
                            pendingScheduleId === item.scheduleId
                              ? "bg-pastel-pink/40 border-pastel-pink text-gray-800"
                              : "bg-pastel-sky/30 border-pastel-sky/60 text-gray-800 hover:bg-pastel-sky/50"
                          }`}
                          title={`${item.title} · ${item.count}/${item.maxCapacity}명 (선택하려면 '선택' 버튼을 누르세요)`}
                        >
                          {item.title} <strong>{item.count}/{item.maxCapacity}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {pendingScheduleId && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">선택한 일정을 확인하려면</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedItemId(pendingScheduleId);
                  setPendingScheduleId(null);
                }}
                className="btn-bounce rounded-xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800"
              >
                선택
              </button>
              <button
                type="button"
                onClick={() => setPendingScheduleId(null)}
                className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300"
              >
                취소
              </button>
            </div>
          )}
        </div>
      )}

      {schedules.length === 0 && (
        <p className="text-gray-500 text-sm">아직 일정이 없어요. 일정 만들기에서 먼저 만드세요.</p>
      )}
      {schedules.length > 0 && filteredSchedules.length === 0 && (
        <p className="text-gray-500 text-sm">필터 조건에 맞는 일정이 없어요.</p>
      )}

      {selectedItemId && selectedSchedule && (
        <div className="rounded-2xl bg-white/90 border-2 border-pastel-lavender p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-gray-800">신청자 목록 · {selectedSchedule.title}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadXlsx}
                disabled={byItem.length === 0 || downloading !== null}
                className="btn-bounce rounded-xl bg-pastel-mint px-3 py-2 text-sm font-bold text-gray-800 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {downloading === "xlsx" ? "저장 중…" : "엑셀"}
              </button>
              <button
                type="button"
                onClick={downloadPdf}
                disabled={byItem.length === 0 || downloading !== null}
                className="btn-bounce rounded-xl bg-pastel-sky px-3 py-2 text-sm font-bold text-gray-800 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {downloading === "pdf" ? "저장 중…" : "PDF"}
              </button>
              <button
                type="button"
                onClick={downloadImage}
                disabled={byItem.length === 0 || downloading !== null}
                className="btn-bounce rounded-xl bg-pastel-lavender px-3 py-2 text-sm font-bold text-gray-800 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <FileImage className="w-4 h-4" />
                {downloading === "image" ? "저장 중…" : "이미지"}
              </button>
            </div>
          </div>

          <div
            ref={captureRef}
            className="rounded-2xl border-2 border-pastel-lavender bg-white p-4 space-y-2"
          >
            <p className="font-bold text-gray-800 text-sm">신청자 목록 · {selectedSchedule.title}</p>
            <div ref={tableRef} className="overflow-x-auto rounded-xl border border-pastel-lavender bg-white">
            {byItem.length === 0 ? (
              <p className="text-gray-500 text-sm p-4">아직 신청자가 없어요.</p>
            ) : (
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-pastel-lavender/50">
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 font-bold text-gray-800 border-b border-pastel-lavender whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-pastel-lavender/50 hover:bg-pastel-cream/50"
                    >
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="px-3 py-2 text-gray-700 border-b border-pastel-lavender/30"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
