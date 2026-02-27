"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { parseCustomFields, type CustomField } from "@/lib/utils";
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
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedSlotBySchedule, setSelectedSlotBySchedule] = useState<Record<string, SlotOption>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const slotKey = (date: string, timeLabel: string) => `${(date || "").slice(0, 10)}_${timeLabel ?? ""}`;

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/schedule?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSchedules(data);
        else setSchedules([]);
      })
      .catch(() => setSchedules([]));
  }, [tenantId]);

  const allFields = useMemo(() => {
    const seen = new Map<string, CustomField>();
    schedules.forEach((s) => {
      parseCustomFields(s.customFields).forEach((f) => {
        if (!seen.has(f.id)) seen.set(f.id, f);
      });
    });
    return Array.from(seen.values());
  }, [schedules]);

  const getSlotCount = (s: ScheduleItem, slot: SlotOption) => {
    if (s.slotCounts) return s.slotCounts[slotKey(slot.date, slot.timeLabel)] ?? 0;
    if ((s.slots?.length ?? 0) <= 1) return s._count?.applications ?? 0;
    return s.slotCounts?.[slotKey(slot.date, slot.timeLabel)] ?? 0;
  };
  const now = new Date();
  const isSlotClosed = (s: ScheduleItem, slot: SlotOption) => {
    const count = getSlotCount(s, slot);
    if (count >= s.maxCapacity) return { closed: true, reason: "인원 마감" as const };
    if (s.applyUntil && now > new Date(s.applyUntil)) return { closed: true, reason: "신청 기간 마감" as const };
    return { closed: false, reason: null };
  };
  const getEffectiveSlot = (s: ScheduleItem): SlotOption | null => {
    const slots = s.slots && s.slots.length > 0 ? s.slots : [{ date: s.dateStart.slice(0, 10), timeLabel: s.timeLabel ?? "" }];
    if (slots.length === 1) return slots[0];
    return selectedSlotBySchedule[s.id] ?? null;
  };

  const validateSchedule = (s: ScheduleItem): string | null => {
    const fields = parseCustomFields(s.customFields);
    for (const f of fields) {
      if (f.required) {
        const v = formData[f.id];
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
          data: formData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error || "신청에 실패했어요." });
        return;
      }
      setMessage({ type: "ok", text: "신청되었어요!" });
      const updated = await fetch(`/api/schedule?tenantId=${tenantId}`).then((r) => r.json());
      setSchedules(Array.isArray(updated) ? updated : schedules);
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

        <section className="card-soft p-5 md:p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">신청자 정보</h2>
          <p className="text-sm text-gray-600 mb-3">모든 필수 항목을 입력해야 일정을 신청할 수 있어요.</p>
          <div className="space-y-3">
            {allFields.map((f) => (
              <div key={f.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>
                {f.type === "text" && (
                  <input
                    type="text"
                    value={formData[f.id] ?? ""}
                    onChange={(e) => setFormData((p) => ({ ...p, [f.id]: e.target.value }))}
                    className="w-full rounded-2xl border-2 border-pastel-lavender px-4 py-2 focus:border-pastel-pink focus:outline-none"
                  />
                )}
                {f.type === "number" && (
                  <input
                    type="number"
                    value={formData[f.id] ?? ""}
                    onChange={(e) => setFormData((p) => ({ ...p, [f.id]: e.target.value }))}
                    className="w-full rounded-2xl border-2 border-pastel-lavender px-4 py-2 focus:border-pastel-pink focus:outline-none"
                  />
                )}
                {f.type === "select" && (
                  <select
                    value={formData[f.id] ?? ""}
                    onChange={(e) => setFormData((p) => ({ ...p, [f.id]: e.target.value }))}
                    className="w-full rounded-2xl border-2 border-pastel-lavender px-4 py-2 focus:border-pastel-pink focus:outline-none"
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
          {allFields.length === 0 && (
            <p className="text-gray-500 text-sm">관리자가 설정한 입력 항목이 없어요.</p>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-3">일정 선택</h2>
          <p className="text-sm text-gray-600 mb-4">원하는 일정(과 일시)을 선택한 뒤 신청하세요.</p>
          <ul className="space-y-3">
            {schedules.map((s) => {
              const slots = (s.slots && s.slots.length > 0 ? s.slots : [{ date: s.dateStart.slice(0, 10), timeLabel: s.timeLabel ?? "" }]) as SlotOption[];
              const selectedSlot = getEffectiveSlot(s);
              const oneSlot = slots.length === 1;
              const closed = selectedSlot ? isSlotClosed(s, selectedSlot) : { closed: false as const, reason: null };
              const canApply = selectedSlot && !closed.closed && !submitting;
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border-2 p-4 transition-all bg-white/90 border-pastel-lavender hover:border-pastel-pink hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800">{s.title}</p>
                      {slots.length > 1 ? (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs text-gray-500">신청할 일시를 하나 선택하세요</p>
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
                        </div>
                      ) : (
                        <>
                          <p className="text-sm mt-0.5 text-gray-600">
                            {format(new Date(slots[0].date), "yyyy년 M월 d일 (EEE)", { locale: ko })}
                            {slots[0].timeLabel ? ` ${slots[0].timeLabel}` : ""}
                          </p>
                          <p className="text-sm mt-1 flex items-center gap-1 text-gray-500">
                            <Users className="w-4 h-4 shrink-0" />
                            신청 {getSlotCount(s, slots[0])}/{s.maxCapacity}명
                            {closed.closed && (
                              <span className="text-red-600 font-bold ml-1">· {closed.reason}</span>
                            )}
                          </p>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => canApply && handleApply(s.id, selectedSlot ?? undefined)}
                      disabled={!canApply}
                      className="btn-bounce rounded-2xl px-5 py-2.5 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0 bg-pastel-pink text-gray-800 shadow hover:shadow-lg disabled:bg-gray-300 disabled:text-gray-500"
                    >
                      {!selectedSlot && slots.length > 1 ? "일시 선택" : closed.closed ? "신청 마감" : submitting === s.id ? "신청 중…" : "신청하기"}
                    </button>
                  </div>
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
