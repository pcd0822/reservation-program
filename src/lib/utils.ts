import { v4 as uuidv4 } from "uuid";

export function generateToken(): string {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

export type CustomField = {
  id: string;
  label: string;
  type: "text" | "number" | "select";
  required: boolean;
  options?: string[];
};

export function parseCustomFields(json: string): CustomField[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function formatScheduleDate(d: Date): string {
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatScheduleDateTime(d: Date, timeLabel?: string | null): string {
  const date = formatScheduleDate(d);
  return timeLabel ? `${date} ${timeLabel}` : date;
}

/** 구글 시트/API에서 오는 날짜 값을 파싱 (ISO 문자열, 시리얼 번호, 로케일 문자열 지원) */
export function parseDateFromSheet(val: string | number | null | undefined): Date | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return null;
    if (val > 1e12) return new Date(val);
    const ms = (val - 25569) * 86400 * 1000;
    return new Date(ms);
  }
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
