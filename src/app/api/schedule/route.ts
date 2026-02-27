import { NextRequest, NextResponse } from "next/server";
import { registryGetTenant } from "@/lib/sheets";
import {
  sheetReadSchedules,
  sheetAppendSchedule,
  sheetDeleteSchedule,
  sheetReadApplications,
  type ScheduleSlot,
} from "@/lib/sheets";
import { generateToken } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }
    const tenant = await registryGetTenant(tenantId);
    if (!tenant?.sheetId) {
      return NextResponse.json([]);
    }
    const schedules = await sheetReadSchedules(tenant.sheetId);
    const applications = await sheetReadApplications(tenant.sheetId);
    const slotKey = (date: string, time: string) => `${(date || "").slice(0, 10)}_${time ?? ""}`;
    const countBySlot = new Map<string, number>();
    applications.forEach((a) => {
      const key = slotKey(a.날짜 ?? "", a.시간 ?? "");
      countBySlot.set(key, (countBySlot.get(key) ?? 0) + 1);
    });
    const list = schedules
      .map((s) => {
        const slotCounts: Record<string, number> = {};
        (s.slots ?? []).forEach((slot) => {
          const key = slotKey(slot.date, slot.timeLabel);
          slotCounts[key] = countBySlot.get(key) ?? 0;
        });
        return {
          ...s,
          _count: { applications: (s.slots ?? []).length > 0 ? undefined : applications.filter((a) => a.일정ID === s.id).length },
          slotCounts: (s.slots ?? []).length > 0 ? slotCounts : undefined,
        };
      })
      .sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());
    return NextResponse.json(list);
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
      customFields: typeof customFields === "string" ? customFields : JSON.stringify(customFields ?? []),
      slots: slots.length > 0 ? slots : undefined,
    });
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
