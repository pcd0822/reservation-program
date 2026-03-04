"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { parseCustomFields, parseDateFromSheet, type CustomField } from "@/lib/utils";
import { XCircle, Users } from "lucide-react";

type SlotOption = { date: string; timeLabel: string };

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
  slots?: SlotOption[];
  _count?: { applications: number };
  slotCounts?: Record<string, number>;
};

type Props = {};

export default function StudentPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [serverTime, setServerTime] = useState<Date | null>(null);
  const [formDataBySchedule, setFormDataBySchedule] = useState<Record<string, Record<string, string>>>({});
  const [selectedSlotBySchedule, setSelectedSlotBySchedule] = useState<Record<string, SlotOption>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  /** API와 동일한 슬롯 키 형식: YYYY-MM-DD_timeLabel (날짜 정규화) */
  const normalizeSlotDate = (d: string | undefined): string => {
    const s = String(d ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
  };
  const slotKey = (date: string, timeLabel: string) => `${normalizeSlotDate(date)}_${timeLabel ?? ""}`;

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/schedule?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.schedules ?? [];
        setSchedules(Array.isArray(arr) ? arr : []);
        setServerTime(data?.serverTime ? new Date(data.serverTime) : null);
      })
      .catch(() => setSchedules([]));
  }, [tenantId]);

  const getSlotCount = (s: ScheduleItem, slot: SlotOption) => {
    const key = slotKey(slot.date ?? "", slot.timeLabel ?? "");
    const multiSlot = (s.slots?.length ?? 0) > 1;
    if (multiSlot) return (s.slotCounts ?? {})[key] ?? 0;
    if (s.slotCounts && key in (s.slotCounts ?? {})) return s.slotCounts![key] ?? 0;
    return s._count?.applications ?? 0;
  };
  const now = serverTime ?? new Date();
  const isSlotNotYetOpen = (s: ScheduleItem) => {
    const from = parseDateFromSheet(s.applyFrom);
    return from != null && now < from;
  };
  const isSlotClosed = (s: ScheduleItem, slot: SlotOption) => {
    if (isSlotNotYetOpen(s)) return { closed: true, reason: "아직 신청 가능 시간이 아님" as const };
    const count = getSlotCount(s, slot);
    if (count >= s.maxCapacity) return { closed: true, reason: "인원 마감" as const };
    const until = parseDateFromSheet(s.applyUntil);
    if (until != null && now > until) return { closed: true, reason: "신청 기간 마감" as const };
    return { closed: false, reason: null };
  };
  const getEffectiveSlot = (s: ScheduleItem): SlotOption | null => {
    const slots = s.slots && s.slots.length > 0 ? s.slots : [{ date: s.dateStart.slice(0, 10), timeLabel: s.timeLabel ?? "" }];
    if (slots.length === 1) return slots[0];
    return selectedSlotBySchedule[s.id] ?? null;
  };

  const validateSchedule = (s: ScheduleItem): string | null => {
    const fields = parseCustomFields(s.customFields);
    const data = formDataBySchedule[s.id] ?? {};
    for (const f of fields) {
      if (f.required) {
        const v = data[f.id];
        if (v === undefined || String(v).trim() === "") return `"${f.label}"을(를) 입력해 주세요.`;
      }
    }
    return null;
  };

  const handleApply = async (scheduleId: string, selectedSlot?: SlotOption) => {
    const s = schedules.find((x) => x.id === scheduleId);
    if (!s) return;
    const slot = selectedSlot ?? getEffectiveSlot(s);
    if (!slot) {
      setMessage({ type: "err", text: "날짜·시간을 선택해 주세요." });
      return;
    }
    const err = validateSchedule(s);
    if (err) {
      setMessage({ type: "err", text: err });
      return;
    }
    const closed = isSlotClosed(s, slot);
    if (closed.closed) {
      setMessage({ type: "err", text: `선택한 일시가 ${closed.reason}되었어요.` });
      return;
    }
    setSubmitting(scheduleId);
    setMessage(null);
    try {
      const res = await fetch("/api/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          scheduleItemId: scheduleId,
          selectedSlot: { date: slot.date.slice(0, 10), timeLabel: slot.timeLabel },
          data: formDataBySchedule[scheduleId] ?? {},
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error || "신청에 실패했어요." });
        return;
      }
      setMessage({ type: "ok", text: "신청되었어요!" });
      const updated = await fetch(`/api/schedule?tenantId=${tenantId}`).then((r) => r.json());
      const arr = Array.isArray(updated) ? updated : updated?.schedules ?? [];
      setSchedules(Array.isArray(arr) ? arr : schedules);
      setServerTime(updated?.serverTime ? new Date(updated.serverTime) : null);
    } catch {
      setMessage({ type: "err", text: "네트워크 오류가 났어요." });
    } finally {
      setSubmitting(null);
    }
  };

  if (!tenantId) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-pastel-cream via-pastel-sky/20 to-pastel-mint/20 relative">
      <p className="absolute top-3 right-4 text-xs text-gray-400 z-10">Designed by Deulssam</p>
      <div className="max-w-2xl mx-auto p-4 pb-12">
        <header className="text-center py-6">
          <h1 className="text-2xl font-bold text-gray-800 rounded-3xl">예약 신청</h1>
          <p className="text-gray-600 text-sm mt-1">아래 항목을 모두 입력한 뒤 원하는 일정을 눌러 신청하세요.</p>
        </header>

        {message && (
          <div
            className={`rounded-2xl p-3 mb-4 text-sm font-medium ${
              message.type === "ok" ? "bg-pastel-mint/60 text-gray-800" : "bg-red-100 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-3">일정별 신청</h2>
          <p className="text-sm text-gray-600 mb-4">원하는 일정을 골라 입력 항목을 채운 뒤, 일시를 선택하고 신청하세요.</p>
          <ul className="space-y-6">
            {schedules.map((s) => {
              const slots = (s.slots && s.slots.length > 0 ? s.slots : [{ date: s.dateStart.slice(0, 10), timeLabel: s.timeLabel ?? "" }]) as SlotOption[];
              const selectedSlot = getEffectiveSlot(s);
              const closed = selectedSlot ? isSlotClosed(s, selectedSlot) : { closed: false as const, reason: null };
              const fields = parseCustomFields(s.customFields);
              const formData = formDataBySchedule[s.id] ?? {};
              const canApply = selectedSlot && !closed.closed && !submitting;
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border-2 p-4 md:p-5 transition-all bg-white/90 border-pastel-lavender hover:border-pastel-pink hover:shadow-md space-y-4"
                >
                  <p className="font-medium text-gray-800 text-base">{s.title}</p>

                  {fields.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-600 font-medium">입력 항목</p>
                      <div className="space-y-2">
                        {fields.map((f) => (
                          <div key={f.id}>
                            <label className="block text-sm text-gray-700 mb-0.5">
                              {f.label} {f.required && <span className="text-red-500">*</span>}
                            </label>
                            {f.type === "text" && (
                              <input
                                type="text"
                                value={formData[f.id] ?? ""}
                                onChange={(e) =>
                                  setFormDataBySchedule((p) => ({
                                    ...p,
                                    [s.id]: { ...(p[s.id] ?? {}), [f.id]: e.target.value },
                                  }))
                                }
                                placeholder={`예: ${f.label} 입력`}
                                className="w-full rounded-xl border-2 border-pastel-lavender px-3 py-2 text-sm placeholder-gray-400 focus:border-pastel-pink focus:outline-none"
                              />
                            )}
                            {f.type === "number" && (
                              <input
                                type="number"
                                value={formData[f.id] ?? ""}
                                onChange={(e) =>
                                  setFormDataBySchedule((p) => ({
                                    ...p,
                                    [s.id]: { ...(p[s.id] ?? {}), [f.id]: e.target.value },
                                  }))
                                }
                                placeholder="숫자 입력"
                                className="w-full rounded-xl border-2 border-pastel-lavender px-3 py-2 text-sm placeholder-gray-400 focus:border-pastel-pink focus:outline-none"
                              />
                            )}
                            {f.type === "select" && (
                              <select
                                value={formData[f.id] ?? ""}
                                onChange={(e) =>
                                  setFormDataBySchedule((p) => ({
                                    ...p,
                                    [s.id]: { ...(p[s.id] ?? {}), [f.id]: e.target.value },
                                  }))
                                }
                                className="w-full rounded-xl border-2 border-pastel-lavender px-3 py-2 text-sm focus:border-pastel-pink focus:outline-none"
                              >
                                <option value="">선택</option>
                                {(f.options ?? []).map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    {slots.length > 1 ? (
                      <>
                        <p className="text-xs text-gray-600 font-medium mb-1.5">신청할 일시 선택</p>
                        <div className="flex flex-wrap gap-2">
                          {slots.map((slot) => {
                            const slotClosed = isSlotClosed(s, slot);
                            const count = getSlotCount(s, slot);
                            const isSelected = selectedSlot?.date === slot.date && selectedSlot?.timeLabel === slot.timeLabel;
                            return (
                              <button
                                key={slotKey(slot.date, slot.timeLabel)}
                                type="button"
                                onClick={() => setSelectedSlotBySchedule((p) => ({ ...p, [s.id]: slot }))}
                                disabled={slotClosed.closed}
                                className={`rounded-xl px-3 py-2 text-sm border-2 transition-all ${
                                  slotClosed.closed
                                    ? "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed"
                                    : isSelected
                                      ? "bg-pastel-pink/30 border-pastel-pink text-gray-800"
                                      : "bg-white border-pastel-lavender hover:border-pastel-pink"
                                }`}
                              >
                                {format(new Date(slot.date), "M/d (EEE)", { locale: ko })}
                                {slot.timeLabel ? ` ${slot.timeLabel}` : ""}
                                <span className="ml-1 text-gray-500">
                                  {count}/{s.maxCapacity}명
                                </span>
                                {slotClosed.closed && " · 마감"}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-600">
                        {format(new Date(slots[0].date), "yyyy년 M월 d일 (EEE)", { locale: ko })}
                        {slots[0].timeLabel ? ` ${slots[0].timeLabel}` : ""}
                        <span className="ml-1 text-gray-500">
                          · 신청 {getSlotCount(s, slots[0])}/{s.maxCapacity}명
                          {closed.closed && <span className="text-red-600 font-bold"> · {closed.reason}</span>}
                        </span>
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => canApply && handleApply(s.id, selectedSlot ?? undefined)}
                    disabled={!canApply}
                    className="btn-bounce rounded-2xl px-5 py-2.5 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto shrink-0 bg-pastel-pink text-gray-800 shadow hover:shadow-lg disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    {!selectedSlot && slots.length > 1 ? "일시 선택" : closed.closed ? "신청 마감" : submitting === s.id ? "신청 중…" : "신청하기"}
                  </button>
                </li>
              );
            })}
          </ul>
          {schedules.length === 0 && (
            <p className="text-gray-500 text-sm">아직 열린 일정이 없어요.</p>
          )}
        </section>
      </div>
    </main>
  );
}
