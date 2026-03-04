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
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }
    const tenant = await registryGetTenant(tenantId);
    if (!tenant?.sheetId) {
      return NextResponse.json(scheduleId ? { schedules: [], serverTime: new Date().toISOString() } : []);
    }
    let schedules = await sheetReadSchedules(tenant.sheetId);
    if (scheduleId && scheduleId.trim()) {
      schedules = schedules.filter((s) => s.id === scheduleId.trim());
    }
    const applications = await sheetReadApplications(tenant.sheetId);
    const slotKey = (date: string, time: string) => `${(date || "").slice(0, 10)}_${time ?? ""}`;
    const countByScheduleSlot = new Map<string, number>();
    applications.forEach((a) => {
      const sid = a.일정ID ?? "";
      const key = `${sid}|${slotKey(a.날짜 ?? "", a.시간 ?? "")}`;
      countByScheduleSlot.set(key, (countByScheduleSlot.get(key) ?? 0) + 1);
    });
    const list = schedules
      .map((s) => {
        const slotCounts: Record<string, number> = {};
        (s.slots ?? []).forEach((slot) => {
          const key = slotKey(slot.date, slot.timeLabel);
          slotCounts[key] = countByScheduleSlot.get(`${s.id}|${key}`) ?? 0;
        });
        return {
          ...s,
          _count: { applications: (s.slots ?? []).length > 0 ? undefined : applications.filter((a) => a.일정ID === s.id).length },
          slotCounts: (s.slots ?? []).length > 0 ? slotCounts : undefined,
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
