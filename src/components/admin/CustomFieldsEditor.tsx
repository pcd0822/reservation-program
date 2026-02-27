"use client";

import { useState } from "react";
import type { CustomField } from "@/lib/utils";

const newId = () => Math.random().toString(36).slice(2, 10);

type Props = {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
};

export function CustomFieldsEditor({ fields, onChange }: Props) {
  const add = () => {
    onChange([
      ...fields,
      { id: newId(), label: "새 항목", type: "text", required: true },
    ]);
  };

  const update = (index: number, patch: Partial<CustomField>) => {
    const next = [...fields];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">신청 시 입력 항목 (설문처럼)</span>
        <button
          type="button"
          onClick={add}
          className="btn-bounce rounded-xl bg-pastel-sky px-3 py-1.5 text-sm font-medium text-gray-800"
        >
          + 항목 추가
        </button>
      </div>
      {fields.length > 0 && (
        <ul className="space-y-2">
          {fields.map((f, i) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/80 p-3 border border-pastel-lavender/50"
            >
              <input
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="항목 이름"
                className="flex-1 min-w-[100px] rounded-xl border border-pastel-lavender px-3 py-1.5 text-sm"
              />
              <select
                value={f.type}
                onChange={(e) => update(i, { type: e.target.value as CustomField["type"] })}
                className="rounded-xl border border-pastel-lavender px-3 py-1.5 text-sm"
              >
                <option value="text">글자</option>
                <option value="number">숫자</option>
                <option value="select">선택</option>
              </select>
              {f.type === "select" && (
                <input
                  value={f.options?.join(", ") ?? ""}
                  onChange={(e) => update(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="옵션을 쉼표로"
                  className="w-32 rounded-xl border border-pastel-lavender px-2 py-1 text-sm"
                />
              )}
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                필수
              </label>
              <button
                type="button"
                onClick={() => remove(i)}
                className="btn-bounce rounded-lg bg-red-100 px-2 py-1 text-sm text-red-700 hover:bg-red-200"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
