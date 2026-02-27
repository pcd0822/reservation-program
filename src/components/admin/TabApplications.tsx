"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { parseCustomFields } from "@/lib/utils";
import { FileSpreadsheet, FileImage, FileText, Search } from "lucide-react";

type StatusFilter = "all" | "in_progress" | "closed" | "upcoming";

type ScheduleItem = {
  id: string;
  title: string;
  type: string;
  dateStart: string;
  dateEnd: string;
  timeLabel: string | null;
  maxCapacity: number;
  applyUntil: string | null;
  customFields: string;
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
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<"xlsx" | "pdf" | "image" | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const load = () => {
    fetch(`/api/schedule?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => setSchedules(Array.isArray(data) ? data : []));
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

  const isClosed = (s: ScheduleItem) => {
    const count = getScheduleCount(s);
    if (count >= s.maxCapacity) return true;
    if (s.applyUntil && new Date() > new Date(s.applyUntil)) return true;
    return false;
  };

  const isUpcoming = (s: ScheduleItem) => new Date(s.dateStart) > new Date();
  const isInProgress = (s: ScheduleItem) => !isUpcoming(s) && !isClosed(s);

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

  const columns = selectedSchedule
    ? ["신청일시", ...parseCustomFields(selectedSchedule.customFields).map((f) => f.label)]
    : [];
  const fieldIds = selectedSchedule
    ? parseCustomFields(selectedSchedule.customFields).map((f) => f.id)
    : [];
  const rows = byItem.map((a) => {
    let data: Record<string, string> = {};
    try {
      data = JSON.parse(a.data) as Record<string, string>;
    } catch {}
    return [
      format(new Date(a.createdAt), "yyyy-MM-dd HH:mm", { locale: ko }),
      ...fieldIds.map((id) => String(data[id] ?? "")),
    ];
  });

  const downloadXlsx = async () => {
    setDownloading("xlsx");
    try {
      const XLSX = (await import("xlsx")).default;
      const wb = XLSX.utils.book_new();
      const wsData = [columns, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const sheetName = "Sheet1".slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `신청목록_${(selectedSchedule?.title ?? "일정").replace(/[/\\*?:\[\]]/g, "_")}_${format(new Date(), "yyyyMMdd")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("다운로드에 실패했어요.");
    } finally {
      setDownloading(null);
    }
  };

  const downloadPdf = async () => {
    setDownloading("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const { autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm" });
      doc.setFont("helvetica");
      doc.setFontSize(12);
      doc.text(selectedSchedule?.title ?? "신청 목록", 14, 12);
      const head = [columns.map((c) => String(c ?? ""))];
      const body = rows.map((row) => row.map((cell) => String(cell ?? "")));
      autoTable(doc, {
        head,
        body,
        startY: 18,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [200, 200, 220] },
      });
      doc.save(`신청목록_${(selectedSchedule?.title ?? "일정").replace(/[/\\*?:\[\]]/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`);
    } catch (e) {
      console.error(e);
      alert("다운로드에 실패했어요.");
    } finally {
      setDownloading(null);
    }
  };

  const downloadImage = async () => {
    if (!tableRef.current) return;
    setDownloading("image");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `신청목록_${selectedSchedule?.title ?? "일정"}_${format(new Date(), "yyyyMMdd")}.png`;
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
          {filterBtn("in_progress", "진행중", "bg-pastel-mint text-gray-800")}
          {filterBtn("closed", "마감", "bg-red-200 text-red-800")}
          {filterBtn("upcoming", "예정", "bg-pastel-sky text-gray-800")}
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filteredSchedules.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedItemId(s.id === selectedItemId ? null : s.id)}
            className={`btn-bounce rounded-2xl border-2 p-4 text-left transition-shadow hover:shadow-md ${getItemColor(s)}`}
          >
            <p className="font-medium truncate">{s.title}</p>
            <p className="text-sm opacity-90 mt-0.5">
              {format(new Date(s.dateStart), "M/d (EEE)", { locale: ko })}
              {s.timeLabel ? ` ${s.timeLabel}` : ""}
            </p>
            <p className="text-sm mt-1">
              신청 <strong>{getScheduleCount(s)}</strong> / {s.maxCapacity}명
              {isClosed(s) && <span className="ml-1 text-red-600 font-bold">· 마감</span>}
            </p>
          </button>
        ))}
      </div>

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
            ref={tableRef}
            className="overflow-x-auto rounded-2xl border border-pastel-lavender bg-white"
          >
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
      )}
    </div>
  );
}
