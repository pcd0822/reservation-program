import { NextRequest, NextResponse } from "next/server";
import { registryGetTenant } from "@/lib/sheets";
import {
  sheetReadSchedules,
  sheetAppendSchedule,
  sheetUpdateSchedule,
  sheetDeleteSchedule,
  sheetReadApplications,
  type ScheduleSlot,
} from "@/lib/sheets";
import { generateToken } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const scheduleId = request.nextUrl.searchParams.get("scheduleId");
    const scheduleIdsParam = request.nextUrl.searchParams.get("scheduleIds");
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }
    const tenant = await registryGetTenant(tenantId);
    if (!tenant?.sheetId) {
      return NextResponse.json(
        scheduleId || scheduleIdsParam ? { schedules: [], serverTime: new Date().toISOString() } : []
      );
    }
    let schedules = await sheetReadSchedules(tenant.sheetId);
    if (scheduleIdsParam && scheduleIdsParam.trim()) {
      const ids = scheduleIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) schedules = schedules.filter((s) => ids.includes(s.id));
    } else if (scheduleId && scheduleId.trim()) {
      schedules = schedules.filter((s) => s.id === scheduleId.trim());
    }
    const applications = await sheetReadApplications(tenant.sheetId);
    const toNormalizedDate = (val: string | undefined): string => {
      if (val == null || val === "") return "";
      const s = String(val).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const n = Number(s);
      if (Number.isFinite(n) && n > 0) {
        const d = n > 1e12 ? new Date(n) : new Date((n - 25569) * 86400 * 1000);
        if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    };
    const slotKey = (date: string, time: string) =>
      `${toNormalizedDate(date || "").slice(0, 10)}_${time ?? ""}`;
    const expandDateRange = (dateStart: string, dateEnd: string): string[] => {
      const dStart = toNormalizedDate(dateStart).slice(0, 10);
      const dEnd = toNormalizedDate(dateEnd).slice(0, 10);
      if (!dStart || !dEnd || dEnd < dStart) return [];
      const out: string[] = [];
      const startMs = new Date(dStart + "T12:00:00Z").getTime();
      const endMs = new Date(dEnd + "T12:00:00Z").getTime();
      for (let t = startMs; t <= endMs; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
      return out;
    };
    const countByScheduleSlot = new Map<string, number>();
    applications.forEach((a) => {
      const sid = a.일정ID ?? "";
      const normDate = toNormalizedDate(a.날짜 ?? "");
      const key = `${sid}|${slotKey(normDate, a.시간 ?? "")}`;
      countByScheduleSlot.set(key, (countByScheduleSlot.get(key) ?? 0) + 1);
    });
    const list = schedules
      .map((s) => {
        let slots = s.slots ?? [];
        if (slots.length <= 1 && s.dateStart && s.dateEnd) {
          const expanded = expandDateRange(s.dateStart, s.dateEnd);
          if (expanded.length > 1)
            slots = expanded.map((date) => ({ date, timeLabel: s.timeLabel ?? "" }));
        }
        const slotCounts: Record<string, number> = {};
        slots.forEach((slot) => {
          const slotNormDate = toNormalizedDate(slot.date ?? "");
          const key = slotKey(slotNormDate, slot.timeLabel ?? "");
          slotCounts[key] = countByScheduleSlot.get(`${s.id}|${key}`) ?? 0;
        });
        const totalForSchedule = applications.filter((a) => a.일정ID === s.id).length;
        return {
          ...s,
          slots,
          _count: slots.length > 0 ? undefined : { applications: totalForSchedule },
          slotCounts: slots.length > 0 ? slotCounts : {},
        };
      })
      .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());
    return NextResponse.json({ schedules: list, serverTime: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantId,
      title,
      groupTitle,
      type,
      dateStart,
      dateEnd,
      timeLabel,
      maxCapacity,
      applyUntil,
      applyFrom,
      customFields,
      slots: slotsInput,
    } = body as {
      tenantId: string;
      title: string;
      groupTitle?: string | null;
      type: "week" | "day" | "time";
      dateStart: string;
      dateEnd: string;
      timeLabel?: string;
      maxCapacity: number;
      applyUntil?: string | null;
      applyFrom?: string | null;
      customFields: string;
      slots?: { date: string; timeLabel?: string }[];
    };

    if (!tenantId || !title || !type || !dateStart || !dateEnd) {
      return NextResponse.json(
        { error: "tenantId, title, type, dateStart, dateEnd required" },
        { status: 400 }
      );
    }

    const tenant = await registryGetTenant(tenantId);
    if (!tenant?.sheetId) {
      return NextResponse.json(
        { error: "먼저 시트 연결 탭에서 구글 시트를 연결해 주세요." },
        { status: 400 }
      );
    }

    const slots: ScheduleSlot[] =
      Array.isArray(slotsInput) && slotsInput.length > 0
        ? slotsInput.map((s) => ({
            date: String(s.date ?? "").slice(0, 10),
            timeLabel: String(s.timeLabel ?? ""),
          })).filter((s) => s.date)
        : [];

    const id = generateToken();
    await sheetAppendSchedule(tenant.sheetId, {
      id,
      title: title.trim(),
      groupTitle: groupTitle != null && String(groupTitle).trim() !== "" ? String(groupTitle).trim() : undefined,
      type,
      dateStart: String(dateStart),
      dateEnd: String(dateEnd),
      timeLabel: timeLabel ?? null,
      maxCapacity: Math.max(1, Number(maxCapacity) || 1),
      applyUntil: applyUntil ?? null,
      applyFrom: applyFrom ?? null,
      customFields: typeof customFields === "string" ? customFields : JSON.stringify(customFields ?? []),
      slots: slots.length > 0 ? slots : undefined,
    });

    return NextResponse.json({
      id,
      tenantId,
      title: title.trim(),
      type,
      dateStart,
      dateEnd,
      timeLabel: timeLabel ?? null,
      maxCapacity: Math.max(1, Number(maxCapacity) || 1),
      applyUntil: applyUntil ?? null,
      applyFrom: applyFrom ?? null,
      customFields: typeof customFields === "string" ? customFields : JSON.stringify(customFields ?? []),
      slots: slots.length > 0 ? slots : undefined,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      tenantId,
      title,
      groupTitle,
      type,
      dateStart,
      dateEnd,
      timeLabel,
      maxCapacity,
      applyUntil,
      applyFrom,
      customFields,
      slots: slotsInput,
    } = body as {
      id: string;
      tenantId: string;
      title: string;
      groupTitle?: string | null;
      type: "week" | "day" | "time";
      dateStart: string;
      dateEnd: string;
      timeLabel?: string | null;
      maxCapacity: number;
      applyUntil?: string | null;
      applyFrom?: string | null;
      customFields: string;
      slots?: { date: string; timeLabel?: string }[];
    };

    if (!id || !tenantId || !title || !type || !dateStart || !dateEnd) {
      return NextResponse.json(
        { error: "id, tenantId, title, type, dateStart, dateEnd required" },
        { status: 400 }
      );
    }

    const tenant = await registryGetTenant(tenantId);
    if (!tenant?.sheetId) {
      return NextResponse.json(
        { error: "시트가 연결되지 않았습니다." },
        { status: 400 }
      );
    }

    const slots: ScheduleSlot[] =
      Array.isArray(slotsInput) && slotsInput.length > 0
        ? slotsInput.map((s) => ({
            date: String(s.date ?? "").slice(0, 10),
            timeLabel: String(s.timeLabel ?? ""),
          })).filter((s) => s.date)
        : [];

    await sheetUpdateSchedule(tenant.sheetId, id, {
      title: title.trim(),
      groupTitle: groupTitle != null && String(groupTitle).trim() !== "" ? String(groupTitle).trim() : undefined,
      type,
      dateStart: String(dateStart),
      dateEnd: String(dateEnd),
      timeLabel: timeLabel ?? null,
      maxCapacity: Math.max(1, Number(maxCapacity) || 1),
      applyUntil: applyUntil ?? null,
      applyFrom: applyFrom ?? null,
      customFields: typeof customFields === "string" ? customFields : JSON.stringify(customFields ?? []),
      slots: slots.length > 0 ? slots : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!id || !tenantId) {
      return NextResponse.json({ error: "id and tenantId required" }, { status: 400 });
    }
    const tenant = await registryGetTenant(tenantId);
    if (!tenant?.sheetId) {
      return NextResponse.json({ error: "시트가 연결되지 않았습니다." }, { status: 400 });
    }
    await sheetDeleteSchedule(tenant.sheetId, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
