"use client";

import { useState } from "react";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import type { CustomField } from "@/lib/utils";
import { startOfWeek, endOfWeek, parseISO } from "date-fns";

type ScheduleType = "week" | "day" | "time";

type Props = { tenantId: string };

export function TabSchedules({ tenantId }: Props) {
  const [step, setStep] = useState<"form" | "result">("form");
  const [type, setType] = useState<ScheduleType>("day");
  const [title, setTitle] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [timeLabel, setTimeLabel] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(5);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [sameSlotTitles, setSameSlotTitles] = useState<string[]>([""]);
  const [creating, setCreating] = useState(false);
  const [createdLinks, setCreatedLinks] = useState<{ studentUrl: string; qrDataUrl: string } | null>(null);

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
  const canCreate = type && (type === "week" ? dateStart && dateEnd : dateStart) && maxCapacity >= 1;

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
      let dateS = dateStart ? parseISO(dateStart) : new Date();
      let dateE = dateEnd ? parseISO(dateEnd) : dateS;
      if (type === "week" && dateStart && dateEnd) {
        dateS = startOfWeek(parseISO(dateStart), { weekStartsOn: 1 });
        dateE = endOfWeek(parseISO(dateEnd), { weekStartsOn: 1 });
      }
      if (type === "day") dateE = dateS;

      for (const t of toCreate) {
        await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            title: t,
            type,
            dateStart: dateS.toISOString(),
            dateEnd: dateE.toISOString(),
            timeLabel: type === "time" ? timeLabel || null : null,
            maxCapacity,
            customFields: JSON.stringify(customFields),
          }),
        });
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const studentUrl = `${origin}/s/${tenantId}`;
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
          <label className="block text-sm font-medium text-gray-700 mb-1">날짜</label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => { setDateStart(e.target.value); if (!dateEnd) setDateEnd(e.target.value); }}
            className="w-full rounded-2xl border-2 border-pastel-lavender px-3 py-2"
          />
        </div>
      )}

      {type === "time" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">시간대 (예: 1교시, 09:00)</label>
          <input
            type="text"
            value={timeLabel}
            onChange={(e) => setTimeLabel(e.target.value)}
            placeholder="1교시"
            className="w-full rounded-2xl border-2 border-pastel-lavender px-3 py-2"
          />
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
          value={maxCapacity}
          onChange={(e) => setMaxCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-24 rounded-2xl border-2 border-pastel-lavender px-3 py-2"
        />
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
