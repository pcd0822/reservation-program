"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { parseCustomFields, type CustomField } from "@/lib/utils";

type ScheduleItem = {
  id: string;
  title: string;
  type: string;
  dateStart: string;
  dateEnd: string;
  timeLabel: string | null;
  maxCapacity: number;
  customFields: string;
  _count?: { applications: number };
};

type Props = {};

export default function StudentPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/schedule?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then(setSchedules);
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

  const getScheduleCounts = () => {
    const map = new Map<string, number>();
    schedules.forEach((s) => map.set(s.id, (s._count?.applications ?? 0)));
    return map;
  };
  const counts = getScheduleCounts();

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

  const handleApply = async (scheduleId: string) => {
    const s = schedules.find((x) => x.id === scheduleId);
    if (!s) return;
    const err = validateSchedule(s);
    if (err) {
      setMessage({ type: "err", text: err });
      return;
    }
    const count = counts.get(scheduleId) ?? 0;
    if (count >= s.maxCapacity) {
      setMessage({ type: "err", text: "이 일정은 마감되었어요." });
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
      setSchedules(updated);
    } catch {
      setMessage({ type: "err", text: "네트워크 오류가 났어요." });
    } finally {
      setSubmitting(null);
    }
  };

  if (!tenantId) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-pastel-cream via-pastel-sky/20 to-pastel-mint/20">
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
          <p className="text-sm text-gray-600 mb-4">원하는 일정을 눌러 신청하세요.</p>
          <ul className="space-y-3">
            {schedules.map((s) => {
              const count = counts.get(s.id) ?? 0;
              const full = count >= s.maxCapacity;
              const canApply = !full && !submitting;
              return (
                <li
                  key={s.id}
                  className={`rounded-2xl border-2 p-4 transition-all ${
                    full
                      ? "bg-gray-100 border-gray-300 text-gray-500"
                      : "bg-white/90 border-pastel-lavender hover:border-pastel-pink hover:shadow-md"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-800">{s.title}</p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(s.dateStart), "yyyy년 M월 d일 (EEE)", { locale: ko })}
                        {s.timeLabel ? ` ${s.timeLabel}` : ""}
                      </p>
                      <p className="text-sm text-gray-500">
                        신청 {count}/{s.maxCapacity}명
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => canApply && handleApply(s.id)}
                      disabled={!canApply}
                      className="btn-bounce rounded-2xl px-5 py-2.5 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-pastel-pink text-gray-800 shadow hover:shadow-lg"
                    >
                      {full ? "마감" : submitting === s.id ? "신청 중…" : "신청하기"}
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
