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
