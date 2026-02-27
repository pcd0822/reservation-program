"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type ScheduleItem = {
  id: string;
  title: string;
  type: string;
  dateStart: string;
  dateEnd: string;
  timeLabel: string | null;
  maxCapacity: number;
  _count: { applications: number };
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

  const load = () => {
    fetch(`/api/schedule?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then(setSchedules);
    fetch(`/api/application?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then(setApplications);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [tenantId]);

  useEffect(() => {
    if (!loading) setLoading(false);
  }, [schedules, applications]);

  const byItem = selectedItemId
    ? applications.filter((a) => a.scheduleItem.id === selectedItemId)
    : [];

  const getItemColor = (s: ScheduleItem) => {
    const count = s._count.applications;
    if (count >= s.maxCapacity) return "bg-red-100 border-red-300 text-red-800";
    if (count > 0) return "bg-pastel-mint/60 border-pastel-mint text-gray-800";
    return "bg-white/80 border-pastel-lavender text-gray-700";
  };

  return (
    <div className="card-soft p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">신청내역 관리</h2>
      <p className="text-sm text-gray-600">
        일정을 클릭하면 해당 일정의 신청자 목록을 볼 수 있어요. 마감된 일정은 빨간색으로 표시돼요.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {schedules.map((s) => (
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
              신청 <strong>{s._count.applications}</strong> / {s.maxCapacity}명
            </p>
          </button>
        ))}
      </div>

      {schedules.length === 0 && (
        <p className="text-gray-500 text-sm">아직 일정이 없어요. 일정 만들기에서 먼저 만드세요.</p>
      )}

      {selectedItemId && (
        <div className="rounded-2xl bg-white/90 border-2 border-pastel-lavender p-4">
          <h3 className="font-bold text-gray-800 mb-3">신청자 목록</h3>
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {byItem.map((a) => {
              const data = (() => {
                try {
                  return JSON.parse(a.data) as Record<string, string | number>;
                } catch {
                  return {};
                }
              })();
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap gap-2 rounded-xl bg-pastel-cream/80 p-2 text-sm"
                >
                  <span className="text-gray-500">
                    {format(new Date(a.createdAt), "MM/dd HH:mm", { locale: ko })}
                  </span>
                  {Object.entries(data).map(([k, v]) => (
                    <span key={k}>
                      <strong>{k}:</strong> {String(v)}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
          {byItem.length === 0 && <p className="text-gray-500 text-sm">아직 신청자가 없어요.</p>}
        </div>
      )}
    </div>
  );
}
