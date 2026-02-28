"use client";

import { useState, useMemo } from "react";
import { CalendarPlus, CalendarDays } from "lucide-react";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import type { CustomField } from "@/lib/utils";
import { startOfWeek, endOfWeek, parseISO, format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameMonth } from "date-fns";
import { ko } from "date-fns/locale";

type ScheduleType = "week" | "day" | "time";

type SlotRow = { date: string; timeLabel: string };

type Props = { tenantId: string };

export function TabSchedules({ tenantId }: Props) {
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [pendingCalendarDate, setPendingCalendarDate] = useState<string | null>(null);

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

  const applyCalendarDate = () => {
    if (!pendingCalendarDate) return;
    const last = slots[slots.length - 1];
    setSlots((p) => [...p, { date: pendingCalendarDate, timeLabel: type === "time" ? (last?.timeLabel ?? "") : "" }]);
    setPendingCalendarDate(null);
    setCalendarOpen(false);
  };

  const handleCreate = async () => {
    if (!canCreate) return;
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
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full rounded-2xl border-2 border-pastel-lavender px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full rounded-2xl border-2 border-pastel-lavender px-3 py-2"
            />
          </div>
        </div>
      )}

      {(type === "day" || type === "time") && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">신청 가능 일시</p>
          <p className="text-xs text-gray-500 mb-2">학생이 선택할 수 있는 날짜·시간을 입력하세요. 여러 개가 필요하면 "일시 추가"를 누르세요.</p>
          {slots.map((slot, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <input
                type="date"
                value={slot.date}
                onChange={(e) => updateSlot(i, "date", e.target.value)}
                className="flex-1 min-w-0 rounded-2xl border-2 border-pastel-lavender px-3 py-2"
              />
              {type === "time" && (
                <input
                  type="text"
                  value={slot.timeLabel}
                  onChange={(e) => updateSlot(i, "timeLabel", e.target.value)}
                  placeholder="시간"
                  className="w-28 rounded-2xl border-2 border-pastel-lavender px-3 py-2"
                />
              )}
              <button
                type="button"
                onClick={() => removeSlot(i)}
                className="btn-bounce rounded-xl bg-red-100 px-2 py-2 text-red-700 text-sm shrink-0"
              >
                삭제
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addSlot}
              className="btn-bounce rounded-xl bg-pastel-sky/80 px-3 py-2 text-sm font-medium inline-flex items-center gap-2 text-gray-800 hover:bg-pastel-sky"
            >
              <CalendarPlus className="w-5 h-5 text-pastel-pink shrink-0" strokeWidth={2} />
              일시 추가
            </button>
            <button
              type="button"
              onClick={() => { setCalendarOpen((o) => !o); setPendingCalendarDate(null); setCalendarMonth(new Date()); }}
              className="btn-bounce rounded-xl bg-pastel-lavender/80 px-3 py-2 text-sm font-medium inline-flex items-center gap-2 text-gray-800"
            >
              <CalendarDays className="w-5 h-5 shrink-0" />
              캘린더에서 날짜 선택
            </button>
          </div>
          {calendarOpen && (
            <div className="mt-4 p-4 rounded-2xl border-2 border-pastel-lavender bg-white/90 space-y-3">
              <p className="text-sm font-medium text-gray-700">날짜를 클릭한 뒤 &#39;선택&#39; 버튼을 누르면 일시로 추가돼요.</p>
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
                    <button type="button" onClick={applyCalendarDate} className="btn-bounce rounded-xl bg-pastel-pink px-4 py-2 text-sm font-medium text-gray-800">
                      선택
                    </button>
                  </>
                )}
                <button type="button" onClick={() => { setCalendarOpen(false); setPendingCalendarDate(null); }} className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300">
                  취소
                </button>
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
          <input
            type="datetime-local"
            value={applyFrom}
            onChange={(e) => setApplyFrom(e.target.value)}
            className="w-full rounded-2xl border-2 border-pastel-lavender px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">비워두면 바로 신청 가능해요.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">예약 신청 마감일시 (선택)</label>
          <input
            type="datetime-local"
            value={applyUntil}
            onChange={(e) => setApplyUntil(e.target.value)}
            className="w-full rounded-2xl border-2 border-pastel-lavender px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">비워두면 마감 시간 없이 인원만 채워질 때까지 신청받아요.</p>
        </div>
      </div>

      <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />

      <button
        type="button"
        onClick={handleCreate}
        disabled={creating || !canCreate}
        className="btn-bounce w-full rounded-2xl bg-pastel-pink py-3 font-medium text-gray-800 shadow-md hover:shadow-lg disabled:opacity-70"
      >
        {creating ? "만드는 중…" : "일정 생성 완료 → 링크 & QR 만들기"}
      </button>
    </div>
  );
}
