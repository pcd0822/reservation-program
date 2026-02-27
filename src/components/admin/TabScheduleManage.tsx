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

type Props = { tenantId: string };

export function TabScheduleManage({ tenantId }: Props) {
  const [list, setList] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/schedule?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        setList(data);
        setLoading(false);
      });
  }, [tenantId]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" 일정을 삭제할까요? 이미 신청된 내역은 함께 삭제됩니다.`)) return;
    await fetch(`/api/schedule?id=${id}&tenantId=${tenantId}`, { method: "DELETE" });
    setList((p) => p.filter((s) => s.id !== id));
  };

  if (loading) return <p className="text-gray-500">로딩 중…</p>;

  return (
    <div className="card-soft p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">일정 관리</h2>
      <p className="text-sm text-gray-600">
        만들어진 일정 목록이에요. 구글 시트에는 일정별 신청 데이터가 계속 누적 저장돼요.
      </p>

      <ul className="space-y-3">
        {list.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-pastel-lavender bg-white/80 p-4"
          >
            <div>
              <p className="font-medium text-gray-800">{s.title}</p>
              <p className="text-sm text-gray-600">
                {format(new Date(s.dateStart), "yyyy.M.d (EEE)", { locale: ko })}
                {s.timeLabel ? ` ${s.timeLabel}` : ""}
                {" · "}
                신청 {s._count.applications}/{s.maxCapacity}명
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(s.id, s.title)}
              className="btn-bounce rounded-xl bg-red-100 px-3 py-1.5 text-sm text-red-700 hover:bg-red-200"
            >
              삭제
            </button>
          </li>
        ))}
      </ul>

      {list.length === 0 && (
        <p className="text-gray-500 text-sm">아직 일정이 없어요. 일정 만들기 탭에서 만드세요.</p>
      )}
    </div>
  );
}
