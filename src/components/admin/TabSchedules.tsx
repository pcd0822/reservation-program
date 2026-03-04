"use client";

import { useState, useMemo, useEffect } from "react";
import { CalendarPlus, CalendarDays } from "lucide-react";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import type { CustomField } from "@/lib/utils";
import { parseCustomFields } from "@/lib/utils";
import { startOfWeek, endOfWeek, parseISO, format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameMonth } from "date-fns";
import { ko } from "date-fns/locale";

type ScheduleType = "week" | "day" | "time";

type SlotRow = { date: string; timeLabel: string };

export type EditGroupItem = {
  id: string;
  title: string;
  type: string;
  dateStart: string;
  dateEnd: string;
  timeLabel: string | null;
  maxCapacity: number;
  applyFrom?: string | null;
  applyUntil?: string | null;
  customFields: string;
  slots?: { date: string; timeLabel?: string }[];
};

export type EditGroup = { key: string; items: EditGroupItem[] };

type Props = {
  tenantId: string;
  editGroup?: EditGroup | null;
  onClearEdit?: () => void;
};

export function TabSchedules({ tenantId, editGroup, onClearEdit }: Props) {
  const [step, setStep] = useState<"form" | "result">("form");
  const [type, setType] = useState<ScheduleType>("day");
  const [title, setTitle] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [timeLabel, setTimeLabel] = useState("");
  const [slots, setSlots] = useState<SlotRow[]>([{ date: "", timeLabel: "" }]);
  const [maxCapacityStr, setMaxCapacityStr] = useState("5");
  const maxCapacityNum = Math.max(1, parseInt(maxCapacityStr, 10) || 0);
  const maxCapacity = maxCapacityNum < 1 ? 1 : maxCapacityNum;
  const [applyFrom, setApplyFrom] = useState("");
  const [applyUntil, setApplyUntil] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [sameSlotTitles, setSameSlotTitles] = useState<string[]>([""]);
  const [creating, setCreating] = useState(false);
  const [createdLinks, setCreatedLinks] = useState<{ studentUrl: string; qrDataUrl: string } | null>(null);
  const [calendarOpenForSlot, setCalendarOpenForSlot] = useState<number | null>(null);
  const [weekDatePickerFor, setWeekDatePickerFor] = useState<"start" | "end" | null>(null);
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

  const addSameSlot = () => {
    setSameSlotTitles((p) => [...p, ""]);
  };
  const updateSameSlot = (i: number, v: string) => {
    setSameSlotTitles((p) => {
      const n = [...p];
      n[i] = v;
      return n;
    });
  };
  const removeSameSlot = (i: number) => {
    setSameSlotTitles((p) => p.filter((_, idx) => idx !== i));
  };

  const titlesToCreate = sameSlotTitles.map((t) => t.trim()).filter(Boolean);
  const slotsToSend = (type === "day" || type === "time") ? slots.filter((s) => s.date.trim()) : [];
  const canCreate =
    type &&
    maxCapacityNum >= 1 &&
    (type === "week" ? dateStart && dateEnd : type === "day" || type === "time" ? slotsToSend.length >= 1 : dateStart);

  const addSlot = () => {
    const last = slots[slots.length - 1];
    setSlots((p) => [...p, { date: last?.date ?? dateStart ?? "", timeLabel: type === "time" ? (last?.timeLabel ?? timeLabel) : "" }]);
  };
  const updateSlot = (i: number, field: "date" | "timeLabel", value: string) => {
    setSlots((p) => {
      const n = [...p];
      n[i] = { ...n[i], [field]: value };
      return n;
    });
  };
  const removeSlot = (i: number) => setSlots((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : [{ date: "", timeLabel: "" }]));

  const calendarGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const openSlotCalendar = (i: number) => {
    const d = slots[i]?.date?.slice(0, 10);
    setPendingCalendarDate(d || null);
    setCalendarMonth(d ? new Date(d) : new Date());
    setCalendarOpenForSlot(i);
    setWeekDatePickerFor(null);
    setSlotDtPickerFor(null);
  };

  const openWeekDatePicker = (which: "start" | "end") => {
    const d = which === "start" ? dateStart?.slice(0, 10) : dateEnd?.slice(0, 10);
    setPendingCalendarDate(d || null);
    setCalendarMonth(d ? new Date(d) : new Date());
    setWeekDatePickerFor(which);
    setCalendarOpenForSlot(null);
    setSlotDtPickerFor(null);
  };

  const applyCalendarDateToSlot = () => {
    if (weekDatePickerFor) {
      if (pendingCalendarDate) {
        if (weekDatePickerFor === "start") setDateStart(pendingCalendarDate);
        else setDateEnd(pendingCalendarDate);
      }
      setWeekDatePickerFor(null);
    } else if (calendarOpenForSlot !== null && pendingCalendarDate) {
      updateSlot(calendarOpenForSlot, "date", pendingCalendarDate);
      setCalendarOpenForSlot(null);
    }
    setPendingCalendarDate(null);
  };

  const slotDtPickerGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(slotDtPickerMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(slotDtPickerMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [slotDtPickerMonth]);

  const openSlotDtPicker = (i: number) => {
    const slot = slots[i];
    const d = slot?.date?.slice(0, 10);
    setSlotDtPickerDate(d || null);
    setSlotDtPickerTime(slot?.timeLabel && /^\d{1,2}:\d{2}$/.test(slot.timeLabel) ? slot.timeLabel : "09:00");
    setSlotDtPickerMonth(d ? new Date(d) : new Date());
    setSlotDtPickerFor(i);
  };

  const applySlotDtPicker = () => {
    if (slotDtPickerFor === null || !slotDtPickerDate) return;
    updateSlot(slotDtPickerFor, "date", slotDtPickerDate);
    updateSlot(slotDtPickerFor, "timeLabel", slotDtPickerTime);
    setSlotDtPickerFor(null);
  };

  const dtPickerGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(dtPickerMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(dtPickerMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [dtPickerMonth]);

  const openDtPicker = (which: "from" | "until") => {
    const raw = which === "from" ? applyFrom : applyUntil;
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

  const applyDtPicker = () => {
    if (!dtPickerFor || !dtPickerDate) return;
    const value = `${dtPickerDate}T${dtPickerTime}`;
    if (dtPickerFor === "from") setApplyFrom(value);
    else setApplyUntil(value);
    setDtPickerFor(null);
  };

  useEffect(() => {
    if (!editGroup?.items?.length) return;
    const first = editGroup.items[0];
    const slotsForForm =
      first.slots && first.slots.length > 0
        ? first.slots.map((x) => ({ date: (x.date ?? "").slice(0, 10), timeLabel: x.timeLabel ?? "" }))
        : [{ date: (first.dateStart ?? "").slice(0, 10), timeLabel: first.timeLabel ?? "" }];
    setStep("form");
    setTitle(first.title ?? "");
    setSameSlotTitles(editGroup.items.map((i) => i.title ?? ""));
    setType((first.type as ScheduleType) || "day");
    setDateStart((first.dateStart ?? "").slice(0, 10));
    setDateEnd((first.dateEnd ?? "").slice(0, 10));
    setTimeLabel(first.timeLabel ?? "");
    setSlots(slotsForForm.length > 0 ? slotsForForm : [{ date: "", timeLabel: "" }]);
    setMaxCapacityStr(String(first.maxCapacity ?? 1));
    setApplyFrom(first.applyFrom ? format(new Date(first.applyFrom), "yyyy-MM-dd'T'HH:mm") : "");
    setApplyUntil(first.applyUntil ? format(new Date(first.applyUntil), "yyyy-MM-dd'T'HH:mm") : "");
    setCustomFields(parseCustomFields(first.customFields));
  }, [editGroup]);

  const handleCreate = async () => {
    if (!canCreate) return;
    if (editGroup?.items?.length) {
      setCreating(true);
      setCreatedLinks(null);
      try {
        const slotsToSend = (type === "day" || type === "time") ? slots.filter((s) => s.date.trim()) : [];
        if ((type === "day" || type === "time") && slotsToSend.length === 0) {
          alert("최소 1개의 날짜/일시를 입력해 주세요.");
          setCreating(false);
          return;
        }
        let dateS: Date;
        let dateE: Date;
        if (slotsToSend.length > 0) {
          const sorted = [...slotsToSend].sort((a, b) => a.date.localeCompare(b.date));
          dateS = parseISO(sorted[0].date);
          dateE = parseISO(sorted[sorted.length - 1].date);
        } else {
          dateS = applyFrom ? new Date(applyFrom) : new Date();
          dateE = applyUntil ? new Date(applyUntil) : dateS;
        }
        const bodySlots =
          slotsToSend.length > 0
            ? slotsToSend.map((s) => ({ date: s.date.slice(0, 10), timeLabel: (type === "time" ? s.timeLabel : "") || "" }))
            : undefined;
        const titles = sameSlotTitles.map((t) => t.trim()).filter(Boolean);
        const toUpdate = titles.length >= 1 ? titles : [title || "일정"];
        for (let i = 0; i < editGroup.items.length; i++) {
          const item = editGroup.items[i];
          const t = toUpdate[i] ?? toUpdate[0] ?? item.title;
          await fetch("/api/schedule", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: item.id,
              tenantId,
              title: t,
              type,
              dateStart: dateS.toISOString(),
              dateEnd: dateE.toISOString(),
              timeLabel: type === "time" && slotsToSend.length > 0 ? (slotsToSend[0]?.timeLabel ?? null) : null,
              maxCapacity,
              applyFrom: applyFrom ? new Date(applyFrom).toISOString() : null,
              applyUntil: applyUntil ? new Date(applyUntil).toISOString() : null,
              customFields: JSON.stringify(customFields),
              slots: bodySlots,
            }),
          });
        }
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const studentUrl =
          editGroup.items.length === 1
            ? `${origin}/s/${tenantId}/${editGroup.items[0].id}`
            : `${origin}/s/${tenantId}`;
        const QRCode = (await import("qrcode")).default;
        const qrDataUrl = await QRCode.toDataURL(studentUrl, { width: 256, margin: 2 });
        setCreatedLinks({ studentUrl, qrDataUrl });
        setStep("result");
        onClearEdit?.();
      } catch (e) {
        console.error(e);
        alert("수정 중 오류가 났어요.");
      } finally {
        setCreating(false);
      }
      return;
    }
    const toCreate = titlesToCreate.length >= 1 ? titlesToCreate : [title || "일정"];
    if (toCreate.length > 1) {
      const ok = window.confirm(
        "같은 일정에 여러 개의 역할/수업을 만듭니다. 각각 제목이 다르게 입력되었는지 확인해 주세요. 계속할까요?"
      );
      if (!ok) return;
    }

    setCreating(true);
    setCreatedLinks(null);
    try {
      let dateS: Date;
      let dateE: Date;
      if (type === "week" && dateStart && dateEnd) {
        dateS = startOfWeek(parseISO(dateStart), { weekStartsOn: 1 });
        dateE = endOfWeek(parseISO(dateEnd), { weekStartsOn: 1 });
      } else if ((type === "day" || type === "time") && slotsToSend.length > 0) {
        const sorted = [...slotsToSend].sort((a, b) => a.date.localeCompare(b.date));
        dateS = parseISO(sorted[0].date);
        dateE = parseISO(sorted[sorted.length - 1].date);
      } else {
        dateS = dateStart ? parseISO(dateStart) : new Date();
        dateE = dateEnd ? parseISO(dateEnd) : dateS;
      }
      if (type === "day" && slotsToSend.length <= 1) dateE = dateS;

      const bodySlots =
        slotsToSend.length > 0
          ? slotsToSend.map((s) => ({ date: s.date.slice(0, 10), timeLabel: (type === "time" ? s.timeLabel : "") || "" }))
          : undefined;

      let lastCreatedId: string | null = null;
      for (const t of toCreate) {
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            title: t,
            type,
            dateStart: dateS.toISOString(),
            dateEnd: dateE.toISOString(),
            timeLabel: type === "time" && slotsToSend.length > 0 ? (slotsToSend[0]?.timeLabel || null) : null,
            maxCapacity,
            applyFrom: applyFrom ? new Date(applyFrom).toISOString() : null,
            applyUntil: applyUntil ? new Date(applyUntil).toISOString() : null,
            customFields: JSON.stringify(customFields),
            slots: bodySlots,
          }),
        });
        const data = await res.json();
        if (data?.id) lastCreatedId = data.id;
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const studentUrl =
        lastCreatedId && toCreate.length === 1
          ? `${origin}/s/${tenantId}/${lastCreatedId}`
          : `${origin}/s/${tenantId}`;
      const QRCode = (await import("qrcode")).default;
      const qrDataUrl = await QRCode.toDataURL(studentUrl, { width: 256, margin: 2 });
      setCreatedLinks({ studentUrl, qrDataUrl });
      setStep("result");
    } catch (e) {
      console.error(e);
      alert("일정 생성 중 오류가 났어요.");
    } finally {
      setCreating(false);
    }
  };

  if (step === "result" && createdLinks) {
    return (
      <div className="card-soft p-6 md:p-8 space-y-6">
        <h2 className="text-xl font-bold text-gray-800">신청 링크 & QR 코드</h2>
        <p className="text-gray-600 text-sm">이 링크나 QR 코드를 학생들에게 공유하세요.</p>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="rounded-2xl bg-white p-4 flex-shrink-0">
            <img src={createdLinks.qrDataUrl} alt="QR" className="w-48 h-48 rounded-xl" />
            <a
              href={createdLinks.qrDataUrl}
              download="qrcode.png"
              className="btn-bounce mt-2 block text-center rounded-xl bg-pastel-sky py-2 text-sm font-medium"
            >
              QR 이미지 저장
            </a>
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-1">신청 링크</label>
            <input
              readOnly
              value={createdLinks.studentUrl}
              className="w-full rounded-2xl border border-pastel-lavender px-4 py-2 text-sm text-gray-800 bg-white"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(createdLinks.studentUrl);
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
          onClick={() => { setStep("form"); setCreatedLinks(null); }}
          className="btn-bounce rounded-2xl bg-pastel-lavender px-4 py-2 text-sm font-medium"
        >
          일정 더 만들기
        </button>
      </div>
    );
  }

  return (
    <div className="card-soft p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">일정 만들기</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">신청 단위</label>
        <div className="flex flex-wrap gap-2">
          {(["week", "day", "time"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`btn-bounce rounded-2xl px-4 py-2 text-sm font-medium ${
                type === t ? "bg-pastel-pink text-gray-800 shadow" : "bg-pastel-lavender/60 text-gray-700"
              }`}
            >
              {t === "week" ? "주차" : t === "day" ? "날짜" : "시간대"}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {type === "week" && "시작일·종료일을 선택하면 그 주차 단위로 신청받아요."}
          {type === "day" && "날짜를 선택하면 그 날짜 단위로 신청받아요."}
          {type === "time" && "날짜와 시간대(예: 1교시)를 정하면 시간별로 신청받아요."}
        </p>
      </div>

      {type === "week" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {dateStart ? format(new Date(dateStart), "yyyy-MM-dd (EEE)", { locale: ko }) : "미설정"}
              </span>
              <button type="button" onClick={() => openWeekDatePicker("start")} className="btn-bounce rounded-xl bg-pastel-lavender/80 p-2 text-gray-700 hover:bg-pastel-lavender shrink-0" title="캘린더에서 날짜 선택">
                <CalendarDays className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {dateEnd ? format(new Date(dateEnd), "yyyy-MM-dd (EEE)", { locale: ko }) : "미설정"}
              </span>
              <button type="button" onClick={() => openWeekDatePicker("end")} className="btn-bounce rounded-xl bg-pastel-lavender/80 p-2 text-gray-700 hover:bg-pastel-lavender shrink-0" title="캘린더에서 날짜 선택">
                <CalendarDays className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {type === "week" && weekDatePickerFor !== null && (
        <div className="mt-4 p-4 rounded-2xl border-2 border-pastel-lavender bg-white/90 space-y-3">
          <p className="text-sm font-medium text-gray-700">
            {weekDatePickerFor === "start" && "시작일을 클릭한 뒤 '선택'을 누르세요."}
            {weekDatePickerFor === "end" && "종료일을 클릭한 뒤 '선택'을 누르세요."}
          </p>
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
                  className={`rounded-lg py-1.5 text-sm ${
                    inMonth ? (isPending ? "bg-pastel-pink text-gray-800 font-bold" : "hover:bg-pastel-sky/40 text-gray-800") : "text-gray-300"
                  }`}
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
                <button type="button" onClick={applyCalendarDateToSlot} className="btn-bounce rounded-xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800">선택</button>
              </>
            )}
            <button type="button" onClick={() => { setWeekDatePickerFor(null); setPendingCalendarDate(null); }} className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300">취소</button>
          </div>
        </div>
      )}

      {(type === "day" || type === "time") && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">신청 가능 일시</p>
          <p className="text-xs text-gray-500 mb-2">
            {type === "day" && "날짜를 선택하세요. 여러 개가 필요하면 \"일시 추가\"를 누르세요."}
            {type === "time" && "날짜와 시간을 선택하세요. 여러 개가 필요하면 \"일시 추가\"를 누르세요."}
          </p>
          {slots.map((slot, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              {type === "day" ? (
                <>
                  <input
                    type="date"
                    value={slot.date}
                    onChange={(e) => updateSlot(i, "date", e.target.value)}
                    className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender px-3 py-2 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-0"
                  />
                  <button type="button" onClick={() => openSlotCalendar(i)} className="btn-bounce rounded-xl bg-pastel-lavender/80 p-2 text-gray-700 hover:bg-pastel-lavender shrink-0" title="캘린더에서 날짜 선택">
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
                  <button type="button" onClick={() => openSlotDtPicker(i)} className="btn-bounce rounded-xl bg-pastel-lavender/80 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-pastel-lavender shrink-0 inline-flex items-center gap-1.5">
                    <CalendarDays className="w-5 h-5" />
                    날짜·시간 선택
                  </button>
                </>
              )}
              <button type="button" onClick={() => removeSlot(i)} className="btn-bounce rounded-xl bg-red-100 px-2 py-2 text-red-700 text-sm shrink-0">
                삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addSlot}
            className="btn-bounce rounded-xl bg-pastel-sky/80 px-3 py-2 text-sm font-medium inline-flex items-center gap-2 text-gray-800 hover:bg-pastel-sky"
          >
            <CalendarPlus className="w-5 h-5 text-pastel-pink shrink-0" strokeWidth={2} />
            일시 추가
          </button>
          {(calendarOpenForSlot !== null || weekDatePickerFor !== null) && (
            <div className="mt-4 p-4 rounded-2xl border-2 border-pastel-lavender bg-white/90 space-y-3">
              <p className="text-sm font-medium text-gray-700">
                {weekDatePickerFor === "start" && "시작일을 클릭한 뒤 '선택'을 누르세요."}
                {weekDatePickerFor === "end" && "종료일을 클릭한 뒤 '선택'을 누르세요."}
                {calendarOpenForSlot !== null && !weekDatePickerFor && "날짜를 클릭한 뒤 '선택' 버튼을 누르면 해당 일시에 반영돼요."}
              </p>
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
                      className={`rounded-lg py-1.5 text-sm ${
                        inMonth
                          ? isPending
                            ? "bg-pastel-pink text-gray-800 font-bold"
                            : "hover:bg-pastel-sky/40 text-gray-800"
                          : "text-gray-300"
                      }`}
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
                    <button type="button" onClick={applyCalendarDateToSlot} className="btn-bounce rounded-xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800">
                      선택
                    </button>
                  </>
                )}
                <button type="button" onClick={() => { setCalendarOpenForSlot(null); setWeekDatePickerFor(null); setPendingCalendarDate(null); }} className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300">
                  취소
                </button>
              </div>
            </div>
          )}
          {type === "time" && slotDtPickerFor !== null && (
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
                    <button type="button" onClick={applySlotDtPicker} className="btn-bounce rounded-xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800">선택</button>
                  </>
                )}
                <button type="button" onClick={() => setSlotDtPickerFor(null)} className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300">취소</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">일정 제목 (기본)</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 청소 당번, 1교시 수업"
          className="w-full rounded-2xl border-2 border-pastel-lavender px-3 py-2"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-1">같은 일정에 여러 역할/수업</p>
        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-2 mb-2">
          같은 날짜·시간에 여러 개를 만들 수 있어요. 각각 제목을 다르게 입력해 주세요.
        </p>
        {sameSlotTitles.map((t, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              value={t}
              onChange={(e) => updateSameSlot(i, e.target.value)}
              placeholder={`제목 ${i + 1}`}
              className="flex-1 rounded-2xl border border-pastel-lavender px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => removeSameSlot(i)}
              className="btn-bounce rounded-xl bg-red-100 px-2 text-red-700 text-sm"
            >
              삭제
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addSameSlot}
          className="btn-bounce rounded-xl bg-pastel-sky/80 px-3 py-1.5 text-sm font-medium"
        >
          + 같은 일정에 하나 더
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">일정당 최대 신청 인원</label>
        <input
          type="number"
          min={1}
          value={maxCapacityStr}
          onChange={(e) => setMaxCapacityStr(e.target.value)}
          className="w-24 rounded-2xl border-2 border-pastel-lavender px-3 py-2"
        />
        {maxCapacityStr !== "" && maxCapacityNum < 1 && (
          <p className="text-xs text-amber-600 mt-1">1 이상의 숫자를 입력해 주세요.</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">예약 신청 가능 시작일시 (선택)</label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {applyFrom ? format(new Date(applyFrom), "yyyy-MM-dd HH:mm", { locale: ko }) : "미설정"}
            </span>
            <button type="button" onClick={() => openDtPicker("from")} className="btn-bounce rounded-xl bg-pastel-lavender/80 px-3 py-2 text-sm font-medium text-gray-800">
              날짜·시간 선택
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">비워두면 바로 신청 가능해요.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">예약 신청 마감일시 (선택)</label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {applyUntil ? format(new Date(applyUntil), "yyyy-MM-dd HH:mm", { locale: ko }) : "미설정"}
            </span>
            <button type="button" onClick={() => openDtPicker("until")} className="btn-bounce rounded-xl bg-pastel-lavender/80 px-3 py-2 text-sm font-medium text-gray-800">
              날짜·시간 선택
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">비워두면 마감 시간 없이 인원만 채워질 때까지 신청받아요.</p>
        </div>
      </div>
      {dtPickerFor && (
        <div className="p-4 rounded-2xl border-2 border-pastel-lavender bg-white/95 space-y-3">
          <p className="text-sm font-medium text-gray-700">
            {dtPickerFor === "from" ? "예약 신청 가능 시작일시" : "예약 신청 마감일시"} — 날짜와 시간을 고른 뒤 '선택'을 누르세요.
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
                <button type="button" onClick={applyDtPicker} className="btn-bounce rounded-xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800">선택</button>
              </>
            )}
            <button type="button" onClick={() => setDtPickerFor(null)} className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300">취소</button>
          </div>
        </div>
      )}

      <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />

      <button
        type="button"
        onClick={handleCreate}
        disabled={creating || !canCreate}
        className="btn-bounce w-full rounded-2xl bg-pastel-pink py-3 font-medium text-gray-800 shadow-md hover:shadow-lg disabled:opacity-70"
      >
        {creating ? (editGroup?.items?.length ? "저장 중…" : "만드는 중…") : (editGroup?.items?.length ? "저장" : "일정 생성 완료 → 링크 & QR 만들기")}
      </button>
    </div>
  );
}
