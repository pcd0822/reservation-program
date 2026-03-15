"use client";

import { useEffect, useState, useMemo } from "react";

type ScheduleSlot = { date: string; timeLabel?: string };

type ScheduleItem = {
  id: string;
  title: string;
  groupTitle?: string | null;
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

type Props = { tenantId: string; onEditGroup?: (group: { key: string; items: ScheduleItem[] }) => void };

export function TabScheduleManage({ tenantId, onEditGroup }: Props) {
  const [list, setList] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedLinks, setSavedLinks] = useState<{ studentUrl: string; qrDataUrl: string } | null>(null);

  const load = () => {
    fetch(`/api/schedule?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.schedules ?? [];
        setList(Array.isArray(arr) ? arr : []);
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

  const groupedList = useMemo(() => {
    const makeKey = (s: ScheduleItem) => {
      const slotsSig = (s.slots ?? [])
        .map((x) => `${x.date}|${x.timeLabel ?? ""}`)
        .sort()
        .join(",");
      return `${s.type}|${s.dateStart}|${s.dateEnd}|${s.timeLabel ?? ""}|${slotsSig}`;
    };
    const map = new Map<string, { key: string; items: ScheduleItem[] }>();
    list.forEach((s) => {
      const key = makeKey(s);
      const group = map.get(key);
      if (group) {
        group.items.push(s);
      } else {
        map.set(key, { key, items: [s] });
      }
    });
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(a.items[0].dateStart).getTime() - new Date(b.items[0].dateStart).getTime()
    );
  }, [list]);

  const openGroupLinkPreview = async (group: { items: ScheduleItem[] }) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const studentUrl =
      group.items.length === 1
        ? `${origin}/s/${tenantId}/${group.items[0].id}`
        : `${origin}/s/${tenantId}?scheduleIds=${group.items.map((i) => i.id).join(",")}`;
    const QRCode = (await import("qrcode")).default;
    const qrDataUrl = await QRCode.toDataURL(studentUrl, { width: 256, margin: 2 });
    setSavedLinks({ studentUrl, qrDataUrl });
  };

  const handleDeleteGroup = async (group: { items: ScheduleItem[] }) => {
    if (!confirm(`이 일정 전체(역할 ${group.items.length}개)를 삭제할까요? 이미 신청된 내역도 함께 삭제됩니다.`)) return;
    for (const item of group.items) {
      await fetch(`/api/schedule?id=${item.id}&tenantId=${tenantId}`, { method: "DELETE" });
    }
    setList((prev) => prev.filter((s) => !group.items.some((i) => i.id === s.id)));
  };

  if (loading) return <p className="text-gray-500">로딩 중…</p>;

  return (
    <div className="card-soft p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">일정 관리</h2>
      <p className="text-sm text-gray-600">
        만들어진 일정 목록이에요. 같은 일정에 여러 역할이면 한 카드로 묶여요. 역할·날짜마다 신청이 독립적으로 집계돼요 (한 날짜에서 신청해도 다른 날짜에는 반영되지 않아요). 수정 후에는 신청 링크를 재생성·재공유해 주세요.
      </p>

      <ul className="space-y-3">
        {groupedList.map((group) => {
          const rep = group.items[0];
          return (
            <li
              key={group.key}
              className="rounded-2xl border-2 border-pastel-lavender bg-white/80 p-4 flex flex-wrap items-center justify-between gap-2"
            >
              <p className="font-medium text-gray-800 truncate flex-1 min-w-0">{rep.groupTitle?.trim() || rep.title}</p>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openGroupLinkPreview(group)}
                  className="btn-bounce rounded-xl bg-white border border-pastel-lavender px-2 py-1 text-xs text-gray-800 hover:bg-pastel-lavender/40"
                >
                  링크 보기
                </button>
                <button
                  type="button"
                  onClick={() => onEditGroup?.(group)}
                  className="btn-bounce rounded-xl bg-pastel-sky px-2 py-1 text-xs text-gray-800 hover:bg-pastel-sky/80"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteGroup(group)}
                  className="btn-bounce rounded-xl bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                >
                  삭제
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {list.length === 0 && (
        <p className="text-gray-500 text-sm">아직 일정이 없어요. 일정 만들기 탭에서 만드세요.</p>
      )}

      {savedLinks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">신청 링크 & QR 코드</h3>
            <p className="text-sm text-gray-600">이 링크나 QR 코드를 학생들에게 공유하세요.</p>
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
