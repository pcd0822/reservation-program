"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isToday } from "date-fns";
import { ko } from "date-fns/locale";
import { parseCustomFields, parseDateFromSheet } from "@/lib/utils";
import { FileSpreadsheet, FileImage, FileText, Search, CalendarDays, LayoutGrid, ChevronDown } from "lucide-react";

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
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    if (filterOpen) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [filterOpen]);

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
  const slotKey = (date: string, timeLabel: string) =>
    `${(date || "").slice(0, 10)}_${timeLabel ?? ""}`;
  const applicationSlotKey = (a: Application) =>
    slotKey(a.scheduleItem.dateStart || "", a.scheduleItem.timeLabel ?? "");
  const byItemRaw = selectedItemId
    ? applications.filter((a) => a.scheduleItem.id === selectedItemId)
    : [];
  const byItem =
    selectedSlotKey === null
      ? byItemRaw
      : byItemRaw.filter((a) => applicationSlotKey(a) === selectedSlotKey);
  const selectedScheduleSlots = selectedSchedule?.slots && selectedSchedule.slots.length > 0
    ? selectedSchedule.slots
    : selectedSchedule?.dateStart
      ? [{ date: selectedSchedule.dateStart.slice(0, 10), timeLabel: selectedSchedule.timeLabel ?? "" }]
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

  type ScheduleSlotItem = {
    scheduleId: string;
    scheduleTitle: string;
    slotKey: string;
    slotDate: string;
    slotTimeLabel: string;
    count: number;
    maxCapacity: number;
    status: "예정" | "진행중" | "마감";
  };
  const scheduleSlotList = useMemo(() => {
    const skFn = (date: string, timeLabel: string) => `${(date || "").slice(0, 10)}_${timeLabel ?? ""}`;
    const out: ScheduleSlotItem[] = [];
    filteredSchedules.forEach((s) => {
      const slots = s.slots && s.slots.length > 0 ? s.slots : [{ date: s.dateStart?.slice(0, 10) ?? "", timeLabel: s.timeLabel ?? "" }];
      const status = getScheduleStatus(s);
      slots.forEach((slot) => {
        const sk = skFn(slot.date ?? "", slot.timeLabel ?? "");
        const count = s.slotCounts?.[sk] ?? 0;
        out.push({
          scheduleId: s.id,
          scheduleTitle: s.title,
          slotKey: sk,
          slotDate: slot.date ?? "",
          slotTimeLabel: slot.timeLabel ?? "",
          count,
          maxCapacity: s.maxCapacity,
          status,
        });
      });
    });
    return out;
  }, [filteredSchedules]);

  const slotKeyForCounts = (date: string, timeLabel: string) => `${(date || "").slice(0, 10)}_${timeLabel ?? ""}`;

  type CalendarItemStatus = "예정" | "진행중" | "마감";
  const calendarDayData = useMemo(() => {
    const skFn = (date: string, timeLabel: string) => `${(date || "").slice(0, 10)}_${timeLabel ?? ""}`;
    const byDate: Record<string, { scheduleId: string; slotKey: string; title: string; count: number; maxCapacity: number; status: CalendarItemStatus }[]> = {};
    filteredSchedules.forEach((s) => {
      const status = getScheduleStatus(s);
      const slots = s.slots && s.slots.length > 0 ? s.slots : [{ date: s.dateStart?.slice(0, 10) ?? "", timeLabel: s.timeLabel ?? "" }];
      if (slots.length > 0 && s.slotCounts) {
        slots.forEach((slot) => {
          const d = slot.date?.slice(0, 10);
          if (!d) return;
          const sk = skFn(slot.date ?? "", slot.timeLabel ?? "");
          const cnt = s.slotCounts![sk] ?? 0;
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push({ scheduleId: s.id, slotKey: sk, title: s.title, count: cnt, maxCapacity: s.maxCapacity, status });
        });
      } else {
        const d = (s.dateStart ?? "").slice(0, 10);
        if (!d) return;
        const sk = skFn(d, s.timeLabel ?? "");
        const cnt = getScheduleCount(s);
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push({ scheduleId: s.id, slotKey: sk, title: s.title, count: cnt, maxCapacity: s.maxCapacity, status });
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
  const columns = selectedSchedule
    ? ["신청일시", "선택한 일시", ...fields.map((f) => f.label)]
    : [];
  const rows = byItem.map((a) => {
    let data: Record<string, string> = {};
    try {
      data = JSON.parse(a.data) as Record<string, string>;
    } catch {}
    const chosenDate = a.scheduleItem.dateStart ? format(new Date(a.scheduleItem.dateStart), "yyyy-MM-dd (EEE)", { locale: ko }) : "";
    const chosenTime = a.scheduleItem.timeLabel ? ` ${a.scheduleItem.timeLabel}` : "";
    return [
      format(new Date(a.createdAt), "yyyy-MM-dd HH:mm", { locale: ko }),
      chosenDate + chosenTime,
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

  return (
    <div className="card-soft p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">신청내역 관리</h2>
      <p className="text-sm text-gray-600">
        일정을 클릭하면 해당 일정의 신청자 목록을 테이블로 볼 수 있어요. 마감된 일정은 빨간색으로 표시돼요.
      </p>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="relative w-full sm:w-auto sm:min-w-[200px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="일정 제목 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border-2 border-pastel-lavender text-sm text-gray-800 placeholder-gray-400 focus:border-pastel-pink focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          <div ref={filterRef} className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            className="btn-bounce rounded-xl border-2 border-pastel-lavender px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5 bg-gray-50 text-gray-700 hover:bg-gray-100 min-w-[72px]"
          >
            {statusFilter === "all" && "전체"}
            {statusFilter === "upcoming" && "예정"}
            {statusFilter === "in_progress" && "진행중"}
            {statusFilter === "closed" && "마감"}
            <ChevronDown className="w-4 h-4 shrink-0 opacity-70" />
          </button>
          {filterOpen && (
            <div className="absolute top-full left-0 mt-1 py-1 rounded-xl border-2 border-pastel-lavender bg-white shadow-lg z-10 min-w-[100px]">
              <button type="button" onClick={() => { setStatusFilter("all"); setFilterOpen(false); }} className={`w-full text-left px-3 py-2 text-sm ${statusFilter === "all" ? "bg-gray-200 font-medium" : "hover:bg-gray-100"}`}>전체</button>
              <button type="button" onClick={() => { setStatusFilter("upcoming"); setFilterOpen(false); }} className={`w-full text-left px-3 py-2 text-sm ${statusFilter === "upcoming" ? "bg-pastel-sky/50 font-medium" : "hover:bg-gray-100"}`}>예정</button>
              <button type="button" onClick={() => { setStatusFilter("in_progress"); setFilterOpen(false); }} className={`w-full text-left px-3 py-2 text-sm ${statusFilter === "in_progress" ? "bg-pastel-mint/50 font-medium" : "hover:bg-gray-100"}`}>진행중</button>
              <button type="button" onClick={() => { setStatusFilter("closed"); setFilterOpen(false); }} className={`w-full text-left px-3 py-2 text-sm ${statusFilter === "closed" ? "bg-red-100 font-medium" : "hover:bg-gray-100"}`}>마감</button>
            </div>
          )}
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
      </div>

      {viewMode === "card" && (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {scheduleSlotList.map((slotItem) => {
          const isSelected = selectedItemId === slotItem.scheduleId && selectedSlotKey === slotItem.slotKey;
          const color =
            slotItem.status === "마감"
              ? "bg-red-100 border-red-300 text-red-800"
              : slotItem.status === "진행중"
                ? "bg-pastel-mint/60 border-pastel-mint text-gray-800"
                : "bg-pastel-sky/40 border-pastel-sky text-gray-800";
          const slotLabel =
            format(new Date(slotItem.slotDate), "M/d (EEE)", { locale: ko }) +
            (slotItem.slotTimeLabel ? ` ${slotItem.slotTimeLabel}` : "");
          return (
            <button
              key={`${slotItem.scheduleId}|${slotItem.slotKey}`}
              type="button"
              onClick={() => {
                if (isSelected) {
                  setSelectedItemId(null);
                  setSelectedSlotKey(null);
                } else {
                  setSelectedItemId(slotItem.scheduleId);
                  setSelectedSlotKey(slotItem.slotKey);
                }
              }}
              className={`btn-bounce rounded-2xl border-2 p-4 text-left transition-shadow hover:shadow-md ${isSelected ? "ring-2 ring-pastel-pink " : ""}${color}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium truncate flex-1 min-w-0">{slotItem.scheduleTitle}</p>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${
                    slotItem.status === "예정"
                      ? "bg-pastel-sky/80 text-gray-800"
                      : slotItem.status === "진행중"
                        ? "bg-pastel-mint text-gray-800"
                        : "bg-red-200 text-red-800"
                  }`}
                >
                  {slotItem.status}
                </span>
              </div>
              <p className="text-sm opacity-90 mt-0.5">{slotLabel}</p>
              <p className="text-sm mt-1">
                신청 <strong>{slotItem.count}</strong> / {slotItem.maxCapacity}명
              </p>
            </button>
          );
        })}
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
                      {items.map((item) => {
                        const baseColor =
                          item.status === "마감"
                            ? "bg-red-100 border-red-300 text-red-800 hover:bg-red-200/80"
                            : item.status === "진행중"
                              ? "bg-pastel-mint/60 border-pastel-mint text-gray-800 hover:bg-pastel-mint/80"
                              : "bg-pastel-sky/40 border-pastel-sky text-gray-800 hover:bg-pastel-sky/60";
                        const isSelected = selectedItemId === item.scheduleId && selectedSlotKey === item.slotKey;
                        return (
                          <button
                            key={item.scheduleId + item.slotKey}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedItemId(null);
                                setSelectedSlotKey(null);
                              } else {
                                setSelectedItemId(item.scheduleId);
                                setSelectedSlotKey(item.slotKey);
                              }
                            }}
                            className={`w-full text-left rounded-lg px-1.5 py-0.5 text-xs truncate border transition-colors ${
                              isSelected ? "bg-pastel-pink/50 border-pastel-pink text-gray-800 ring-1 ring-pastel-pink" : baseColor
                            }`}
                            title={`${item.title} · ${item.count}/${item.maxCapacity}명 · ${item.status}`}
                          >
                            {item.title} <strong>{item.count}/{item.maxCapacity}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
              {selectedScheduleSlots.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-500 mr-1">날짜별:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedSlotKey(null)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${selectedSlotKey === null ? "bg-pastel-pink text-gray-800" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    전체
                  </button>
                  {selectedScheduleSlots.map((slot) => {
                    const sk = slotKey(slot.date ?? "", slot.timeLabel ?? "");
                    const label = format(new Date(slot.date), "M/d (EEE)", { locale: ko }) + (slot.timeLabel ? ` ${slot.timeLabel}` : "");
                    return (
                      <button
                        key={sk}
                        type="button"
                        onClick={() => setSelectedSlotKey(sk)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${selectedSlotKey === sk ? "bg-pastel-pink text-gray-800" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
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
