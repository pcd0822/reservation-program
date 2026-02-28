"use client";

import { useEffect, useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth } from "date-fns";
import { ko } from "date-fns/locale";
import { parseISO } from "date-fns";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import type { CustomField } from "@/lib/utils";
import { parseCustomFields, parseDateFromSheet } from "@/lib/utils";
import { CalendarPlus, CalendarDays, Pencil } from "lucide-react";

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

type Props = { tenantId: string };

export function TabScheduleManage({ tenantId }: Props) {
  const [list, setList] = useState<ScheduleItem[]>([]);
  const [serverTime, setServerTime] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    type: "week" | "day" | "time";
    dateStart: string;
    dateEnd: string;
    timeLabel: string;
    maxCapacity: number;
    applyFrom: string;
    applyUntil: string;
    customFields: CustomField[];
    slots: { date: string; timeLabel: string }[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedLinks, setSavedLinks] = useState<{ studentUrl: string; qrDataUrl: string } | null>(null);
  const [maxCapacityInput, setMaxCapacityInput] = useState("");
  const [calendarOpenForSlot, setCalendarOpenForSlot] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [pendingCalendarDate, setPendingCalendarDate] = useState<string | null>(null);
  const [slotDtPickerFor, setSlotDtPickerFor] = useState<number | null>(null);
  const [slotDtPickerMonth, setSlotDtPickerMonth] = useState(() => new Date());
  const [slotDtPickerDate, setSlotDtPickerDate] = useState<string | null>(null);
  const [slotDtPickerTime, setSlotDtPickerTime] = useState("09:00");
  const [dtPickerFor, setDtPickerFor] = useState<"from" | "until" | null>(null);
  const [dtPickerMonth, setDtPickerMonth] = useState(() => new Date());
  const [dtPickerDate, setDtPickerDate] = useState<string | null>(null);
  const [dtPickerTime, setDtPickerTime] = useState("09:00");

  const load = () => {
    fetch(`/api/schedule?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.schedules ?? [];
        setList(Array.isArray(arr) ? arr : []);
        setServerTime(data?.serverTime ? new Date(data.serverTime) : null);
        setLoading(false);
      })
      .catch(() => {
        setList([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, [tenantId]);

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
        return `${format(new Date(dates[0]), "M.d (EEE)", { locale: ko })}~${format(new Date(dates[dates.length - 1]), "M.d (EEE)", { locale: ko })}`;
      }
    }
    if (slots && slots.length === 1 && slots[0].date) {
      return format(new Date(slots[0].date), "M.d (EEE)", { locale: ko });
    }
    const start = s.dateStart;
    const end = s.dateEnd;
    if (start && end && start.slice(0, 10) !== end.slice(0, 10)) {
      return `${format(new Date(start), "M.d (EEE)", { locale: ko })}~${format(new Date(end), "M.d (EEE)", { locale: ko })}`;
    }
    return format(new Date(start || end || 0), "M.d (EEE)", { locale: ko });
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" 일정을 삭제할까요? 이미 신청된 내역은 함께 삭제됩니다.`)) return;
    await fetch(`/api/schedule?id=${id}&tenantId=${tenantId}`, { method: "DELETE" });
    setList((p) => p.filter((s) => s.id !== id));
  };

  const openEdit = (s: ScheduleItem) => {
    const slots = s.slots ?? [];
    const slotsForForm =
      slots.length > 0
        ? slots.map((x) => ({ date: x.date.slice(0, 10), timeLabel: x.timeLabel ?? "" }))
        : [{ date: s.dateStart?.slice(0, 10) ?? "", timeLabel: s.timeLabel ?? "" }];
    setEditForm({
      title: s.title,
      type: (s.type as "week" | "day" | "time") || "day",
      dateStart: s.dateStart?.slice(0, 10) ?? "",
      dateEnd: s.dateEnd?.slice(0, 10) ?? "",
      timeLabel: s.timeLabel ?? "",
      maxCapacity: s.maxCapacity,
      applyFrom: s.applyFrom ? format(new Date(s.applyFrom), "yyyy-MM-dd'T'HH:mm") : "",
      applyUntil: s.applyUntil ? format(new Date(s.applyUntil), "yyyy-MM-dd'T'HH:mm") : "",
      customFields: parseCustomFields(s.customFields),
      slots: slotsForForm,
    });
    setMaxCapacityInput(String(s.maxCapacity));
    setEditingId(s.id);
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setMaxCapacityInput("");
  };

  const updateEditSlot = (i: number, field: "date" | "timeLabel", value: string) => {
    if (!editForm) return;
    setEditForm({
      ...editForm,
      slots: editForm.slots.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)),
    });
  };
  const addEditSlot = () => {
    if (!editForm) return;
    setEditForm({
      ...editForm,
      slots: [...editForm.slots, { date: editForm.dateStart || "", timeLabel: editForm.timeLabel }],
    });
  };
  const removeEditSlot = (i: number) => {
    if (!editForm || editForm.slots.length <= 1) return;
    setEditForm({ ...editForm, slots: editForm.slots.filter((_, idx) => idx !== i) });
  };

  const calendarGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const openEditSlotCalendar = (i: number) => {
    if (!editForm) return;
    const d = editForm.slots[i]?.date?.slice(0, 10);
    setPendingCalendarDate(d || null);
    setCalendarMonth(d ? new Date(d) : new Date());
    setCalendarOpenForSlot(i);
    setSlotDtPickerFor(null);
  };

  const applyEditCalendarDateToSlot = () => {
    if (!editForm || calendarOpenForSlot === null || !pendingCalendarDate) return;
    setEditForm({
      ...editForm,
      slots: editForm.slots.map((s, idx) =>
        idx === calendarOpenForSlot ? { ...s, date: pendingCalendarDate } : s
      ),
    });
    setCalendarOpenForSlot(null);
    setPendingCalendarDate(null);
  };

  const slotDtPickerGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(slotDtPickerMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(slotDtPickerMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [slotDtPickerMonth]);

  const openEditSlotDtPicker = (i: number) => {
    if (!editForm) return;
    const slot = editForm.slots[i];
    const d = slot?.date?.slice(0, 10);
    setSlotDtPickerDate(d || null);
    setSlotDtPickerTime(slot?.timeLabel && /^\d{1,2}:\d{2}$/.test(slot.timeLabel) ? slot.timeLabel : "09:00");
    setSlotDtPickerMonth(d ? new Date(d) : new Date());
    setSlotDtPickerFor(i);
  };

  const applyEditSlotDtPicker = () => {
    if (!editForm || slotDtPickerFor === null || !slotDtPickerDate) return;
    setEditForm({
      ...editForm,
      slots: editForm.slots.map((s, idx) =>
        idx === slotDtPickerFor ? { ...s, date: slotDtPickerDate, timeLabel: slotDtPickerTime } : s
      ),
    });
    setSlotDtPickerFor(null);
  };

  const dtPickerGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(dtPickerMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(dtPickerMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [dtPickerMonth]);

  const openEditDtPicker = (which: "from" | "until") => {
    if (!editForm) return;
    const raw = which === "from" ? editForm.applyFrom : editForm.applyUntil;
    if (raw) {
      const d = raw.slice(0, 10);
      const t = raw.slice(11, 16) || "09:00";
      setDtPickerDate(d);
      setDtPickerTime(t);
      setDtPickerMonth(d ? new Date(d) : new Date());
    } else {
      const today = format(new Date(), "yyyy-MM-dd");
      setDtPickerDate(today);
      setDtPickerTime("09:00");
      setDtPickerMonth(new Date());
    }
    setDtPickerFor(which);
  };

  const applyEditDtPicker = () => {
    if (!editForm || !dtPickerFor || !dtPickerDate) return;
    const value = `${dtPickerDate}T${dtPickerTime}`;
    setEditForm({ ...editForm, [dtPickerFor === "from" ? "applyFrom" : "applyUntil"]: value });
    setDtPickerFor(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm) return;
    const slotsToSend = (editForm.type === "day" || editForm.type === "time")
      ? editForm.slots.filter((s) => s.date.trim())
      : [];
    if ((editForm.type === "day" || editForm.type === "time") && slotsToSend.length === 0) {
      alert("최소 1개의 날짜/일시를 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      let dateS: Date;
      let dateE: Date;
      if (slotsToSend.length > 0) {
        const sorted = [...slotsToSend].sort((a, b) => a.date.localeCompare(b.date));
        dateS = new Date(sorted[0].date);
        dateE = new Date(sorted[sorted.length - 1].date);
      } else {
        dateS = editForm.applyFrom ? new Date(editForm.applyFrom) : new Date();
        dateE = editForm.applyUntil ? new Date(editForm.applyUntil) : dateS;
      }
      const bodySlots =
        slotsToSend.length > 0
          ? slotsToSend.map((s) => ({ date: s.date.slice(0, 10), timeLabel: editForm.type === "time" ? s.timeLabel : "" }))
          : undefined;

      await fetch("/api/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          tenantId,
          title: editForm.title.trim(),
          type: editForm.type,
          dateStart: dateS.toISOString(),
          dateEnd: dateE.toISOString(),
          timeLabel: editForm.type === "time" ? editForm.timeLabel || null : null,
          maxCapacity: Math.max(1, parseInt(maxCapacityInput, 10) || 1),
          applyFrom: editForm.applyFrom ? new Date(editForm.applyFrom).toISOString() : null,
          applyUntil: editForm.applyUntil ? new Date(editForm.applyUntil).toISOString() : null,
          customFields: JSON.stringify(editForm.customFields),
          slots: bodySlots,
        }),
      });
      load();
      const scheduleIdForLink = editingId;
      closeEdit();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const studentUrl = `${origin}/s/${tenantId}/${scheduleIdForLink}`;
      const QRCode = (await import("qrcode")).default;
      const qrDataUrl = await QRCode.toDataURL(studentUrl, { width: 256, margin: 2 });
      setSavedLinks({ studentUrl, qrDataUrl });
    } catch (e) {
      console.error(e);
      alert("수정 중 오류가 났어요.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500">로딩 중…</p>;

  return (
    <div className="card-soft p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">일정 관리</h2>
      <p className="text-sm text-gray-600">
        만들어진 일정 목록이에요. 구글 시트에는 일정별 신청 데이터가 계속 누적 저장돼요. 수정 후에는 신청 링크를 재생성·재공유해 주세요.
      </p>

      <ul className="space-y-3">
        {list.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-pastel-lavender bg-white/80 p-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-gray-800">{s.title}</p>
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
              <p className="text-sm text-gray-600 mt-0.5">
                {formatDateRange(s)}
                {s.timeLabel && !(s.slots && s.slots.length > 1) ? ` ${s.timeLabel}` : ""}
                {" · "}
                신청 {getScheduleCount(s)}/{s.maxCapacity}명
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openEdit(s)}
                className="btn-bounce rounded-xl bg-pastel-sky px-3 py-1.5 text-sm text-gray-800 hover:bg-pastel-sky/80"
              >
                <Pencil className="w-4 h-4 inline mr-1" />
                수정
              </button>
              <button
                type="button"
                onClick={() => handleDelete(s.id, s.title)}
                className="btn-bounce rounded-xl bg-red-100 px-3 py-1.5 text-sm text-red-700 hover:bg-red-200"
              >
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>

      {list.length === 0 && (
        <p className="text-gray-500 text-sm">아직 일정이 없어요. 일정 만들기 탭에서 만드세요.</p>
      )}

      {editingId && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">일정 수정</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full rounded-2xl border-2 border-pastel-lavender px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">신청 단위</label>
              <div className="flex gap-2">
                {(["week", "day", "time"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditForm({ ...editForm, type: t })}
                    className={`btn-bounce rounded-xl px-3 py-1.5 text-sm ${editForm.type === t ? "bg-pastel-pink text-gray-800" : "bg-gray-100 text-gray-600"}`}
                  >
                    {t === "week" ? "주차" : t === "day" ? "날짜" : "시간대"}
                  </button>
                ))}
              </div>
            </div>
            {(editForm.type === "day" || editForm.type === "time") && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">신청 가능 일시</p>
                <p className="text-xs text-gray-500 mb-2">
                  {editForm.type === "day" && "날짜를 선택하세요. 여러 개가 필요하면 \"일시 추가\"를 누르세요."}
                  {editForm.type === "time" && "날짜와 시간을 선택하세요. 여러 개가 필요하면 \"일시 추가\"를 누르세요."}
                </p>
                {editForm.slots.map((slot, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    {editForm.type === "day" ? (
                      <>
                        <input
                          type="date"
                          value={slot.date}
                          onChange={(e) => updateEditSlot(i, "date", e.target.value)}
                          className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender px-3 py-2 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-0"
                        />
                        <button type="button" onClick={() => openEditSlotCalendar(i)} className="btn-bounce rounded-xl bg-pastel-lavender/80 p-2 text-gray-700 hover:bg-pastel-lavender shrink-0" title="캘린더에서 날짜 선택">
                          <CalendarDays className="w-5 h-5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender bg-gray-50 px-3 py-2 text-sm text-gray-700">
                          {slot.date && slot.timeLabel
                            ? `${format(new Date(slot.date), "yyyy-MM-dd (EEE)", { locale: ko })} ${slot.timeLabel}`
                            : "미설정"}
                        </span>
                        <button type="button" onClick={() => openEditSlotDtPicker(i)} className="btn-bounce rounded-xl bg-pastel-lavender/80 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-pastel-lavender shrink-0 inline-flex items-center gap-1.5">
                          <CalendarDays className="w-5 h-5" />
                          날짜·시간 선택
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => removeEditSlot(i)} className="btn-bounce rounded-xl bg-red-100 px-2 py-2 text-red-700 text-sm shrink-0">
                      삭제
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEditSlot}
                  className="btn-bounce rounded-xl bg-pastel-sky/80 px-3 py-2 text-sm inline-flex items-center gap-1"
                >
                  <CalendarPlus className="w-4 h-4" />
                  일시 추가
                </button>
                {calendarOpenForSlot !== null && (
                  <div className="mt-4 p-4 rounded-2xl border-2 border-pastel-lavender bg-white/90 space-y-3">
                    <p className="text-sm font-medium text-gray-700">날짜를 클릭한 뒤 '선택' 버튼을 누르면 해당 일시에 반영돼요.</p>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setCalendarMonth((m) => subMonths(m, 1))} className="btn-bounce rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">이전</button>
                      <span className="text-sm font-bold text-gray-800">{format(calendarMonth, "yyyy년 M월", { locale: ko })}</span>
                      <button type="button" onClick={() => setCalendarMonth((m) => addMonths(m, 1))} className="btn-bounce rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">다음</button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 text-center">
                      {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                        <div key={d} className="py-1 text-xs font-semibold text-gray-500">{d}</div>
                      ))}
                      {calendarGrid.map((day) => {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const inMonth = isSameMonth(day, calendarMonth);
                        const isPending = pendingCalendarDate === dateStr;
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => setPendingCalendarDate(dateStr)}
                            className={`rounded-lg py-1.5 text-sm ${inMonth ? (isPending ? "bg-pastel-pink text-gray-800 font-bold" : "hover:bg-pastel-sky/40 text-gray-800") : "text-gray-300"}`}
                          >
                            {format(day, "d")}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {pendingCalendarDate && (
                        <>
                          <span className="text-sm text-gray-600">{format(new Date(pendingCalendarDate), "yyyy년 M월 d일 (EEE)", { locale: ko })}</span>
                          <button type="button" onClick={applyEditCalendarDateToSlot} className="btn-bounce rounded-xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800">선택</button>
                        </>
                      )}
                      <button type="button" onClick={() => { setCalendarOpenForSlot(null); setPendingCalendarDate(null); }} className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300">취소</button>
                    </div>
                  </div>
                )}
                {editForm.type === "time" && slotDtPickerFor !== null && (
                  <div className="mt-4 p-4 rounded-2xl border-2 border-pastel-lavender bg-white/90 space-y-3">
                    <p className="text-sm font-medium text-gray-700">날짜와 시간을 고른 뒤 '선택'을 누르면 해당 일시에 반영돼요.</p>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setSlotDtPickerMonth((m) => subMonths(m, 1))} className="btn-bounce rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">이전</button>
                      <span className="text-sm font-bold text-gray-800">{format(slotDtPickerMonth, "yyyy년 M월", { locale: ko })}</span>
                      <button type="button" onClick={() => setSlotDtPickerMonth((m) => addMonths(m, 1))} className="btn-bounce rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">다음</button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 text-center">
                      {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                        <div key={d} className="py-1 text-xs font-semibold text-gray-500">{d}</div>
                      ))}
                      {slotDtPickerGrid.map((day) => {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const inMonth = isSameMonth(day, slotDtPickerMonth);
                        const isPending = slotDtPickerDate === dateStr;
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => setSlotDtPickerDate(dateStr)}
                            className={`rounded-lg py-1.5 text-sm ${inMonth ? (isPending ? "bg-pastel-pink text-gray-800 font-bold" : "hover:bg-pastel-sky/40 text-gray-800") : "text-gray-300"}`}
                          >
                            {format(day, "d")}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm text-gray-700">시간</label>
                      <input type="time" value={slotDtPickerTime} onChange={(e) => setSlotDtPickerTime(e.target.value)} className="rounded-xl border-2 border-pastel-lavender px-3 py-2 text-sm" />
                      {slotDtPickerDate && (
                        <>
                          <span className="text-sm text-gray-600">{format(new Date(slotDtPickerDate), "M/d (EEE)", { locale: ko })} {slotDtPickerTime}</span>
                          <button type="button" onClick={applyEditSlotDtPicker} className="btn-bounce rounded-xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800">선택</button>
                        </>
                      )}
                      <button type="button" onClick={() => setSlotDtPickerFor(null)} className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300">취소</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시작일시</label>
                <div className="w-full rounded-2xl border-2 border-pastel-lavender bg-gray-50 px-3 py-2 text-gray-700 text-sm">
                  {editForm.applyFrom ? format(new Date(editForm.applyFrom), "yyyy-MM-dd HH:mm", { locale: ko }) : "—"}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">신청 가능 일시의 처음 (수정 불가)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">종료일시</label>
                <div className="w-full rounded-2xl border-2 border-pastel-lavender bg-gray-50 px-3 py-2 text-gray-700 text-sm">
                  {editForm.applyUntil ? format(new Date(editForm.applyUntil), "yyyy-MM-dd HH:mm", { locale: ko }) : "—"}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">신청 가능 일시의 끝 (수정 불가)</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">신청 가능 시작일시</label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {editForm.applyFrom ? format(new Date(editForm.applyFrom), "yyyy-MM-dd HH:mm", { locale: ko }) : "미설정"}
                  </span>
                  <button type="button" onClick={() => openEditDtPicker("from")} className="btn-bounce rounded-xl bg-pastel-lavender/80 px-3 py-2 text-sm font-medium text-gray-800">
                    날짜·시간 선택
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">신청 마감일시</label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {editForm.applyUntil ? format(new Date(editForm.applyUntil), "yyyy-MM-dd HH:mm", { locale: ko }) : "미설정"}
                  </span>
                  <button type="button" onClick={() => openEditDtPicker("until")} className="btn-bounce rounded-xl bg-pastel-lavender/80 px-3 py-2 text-sm font-medium text-gray-800">
                    날짜·시간 선택
                  </button>
                </div>
              </div>
            </div>
            {dtPickerFor && (
              <div className="p-4 rounded-2xl border-2 border-pastel-lavender bg-white/95 space-y-3">
                <p className="text-sm font-medium text-gray-700">
                  {dtPickerFor === "from" ? "신청 가능 시작일시" : "신청 마감일시"} — 날짜와 시간을 고른 뒤 '선택'을 누르세요.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setDtPickerMonth((m) => subMonths(m, 1))} className="btn-bounce rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">이전</button>
                  <span className="text-sm font-bold text-gray-800">{format(dtPickerMonth, "yyyy년 M월", { locale: ko })}</span>
                  <button type="button" onClick={() => setDtPickerMonth((m) => addMonths(m, 1))} className="btn-bounce rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">다음</button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                    <div key={d} className="py-1 text-xs font-semibold text-gray-500">{d}</div>
                  ))}
                  {dtPickerGrid.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const inMonth = isSameMonth(day, dtPickerMonth);
                    const isPending = dtPickerDate === dateStr;
                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => setDtPickerDate(dateStr)}
                        className={`rounded-lg py-1.5 text-sm ${inMonth ? (isPending ? "bg-pastel-pink text-gray-800 font-bold" : "hover:bg-pastel-sky/40 text-gray-800") : "text-gray-300"}`}
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm text-gray-700">시간</label>
                  <input type="time" value={dtPickerTime} onChange={(e) => setDtPickerTime(e.target.value)} className="rounded-xl border-2 border-pastel-lavender px-3 py-2 text-sm" />
                  {dtPickerDate && (
                    <>
                      <span className="text-sm text-gray-600">{format(new Date(dtPickerDate), "M/d (EEE)", { locale: ko })} {dtPickerTime}</span>
                      <button type="button" onClick={applyEditDtPicker} className="btn-bounce rounded-xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800">선택</button>
                    </>
                  )}
                  <button type="button" onClick={() => setDtPickerFor(null)} className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300">취소</button>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">최대 인원</label>
              <input
                type="number"
                min={1}
                value={maxCapacityInput}
                onChange={(e) => setMaxCapacityInput(e.target.value)}
                className="w-24 rounded-2xl border-2 border-pastel-lavender px-3 py-2"
              />
              {maxCapacityInput !== "" && (parseInt(maxCapacityInput, 10) || 0) < 1 && (
                <p className="text-xs text-amber-600 mt-1">1 이상의 숫자를 입력해 주세요.</p>
              )}
            </div>
            <CustomFieldsEditor fields={editForm.customFields} onChange={(f) => setEditForm({ ...editForm, customFields: f })} />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                className="btn-bounce flex-1 rounded-2xl bg-pastel-pink py-2 font-medium disabled:opacity-70"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
              <button type="button" onClick={closeEdit} className="btn-bounce rounded-2xl bg-gray-200 py-2 px-4">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {savedLinks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">일정이 수정되었습니다</h3>
            <p className="text-sm text-gray-600">변경 사항이 반영되었어요. 아래 링크를 공유하면 해당 일정만 보이고, 그 일정에 대한 신청만 받을 수 있어요.</p>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="rounded-2xl bg-gray-50 p-4 flex-shrink-0">
                <img src={savedLinks.qrDataUrl} alt="QR" className="w-40 h-40 rounded-xl" />
                <a
                  href={savedLinks.qrDataUrl}
                  download="qrcode.png"
                  className="btn-bounce mt-2 block text-center rounded-xl bg-pastel-sky py-2 text-sm font-medium"
                >
                  QR 이미지 저장
                </a>
              </div>
              <div className="flex-1 min-w-0 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">신청 링크</label>
                <input
                  readOnly
                  value={savedLinks.studentUrl}
                  className="w-full rounded-2xl border border-pastel-lavender px-4 py-2 text-sm text-gray-800 bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(savedLinks.studentUrl);
                    alert("클립보드에 복사되었어요!");
                  }}
                  className="btn-bounce mt-2 rounded-2xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800"
                >
                  링크 복사
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSavedLinks(null)}
              className="btn-bounce w-full rounded-2xl bg-pastel-lavender py-2 font-medium"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
