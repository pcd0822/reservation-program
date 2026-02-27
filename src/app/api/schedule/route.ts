import { NextRequest, NextResponse } from "next/server";
import { registryGetTenant } from "@/lib/sheets";
import {
  sheetReadSchedules,
  sheetAppendSchedule,
  sheetDeleteSchedule,
  sheetReadApplications,
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
    const countByScheduleId = new Map<string, number>();
    applications.forEach((a) => {
      const id = a.일정ID || "";
      countByScheduleId.set(id, (countByScheduleId.get(id) ?? 0) + 1);
    });
    const list = schedules
      .map((s) => ({
        ...s,
        _count: { applications: countByScheduleId.get(s.id) ?? 0 },
      }))
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
