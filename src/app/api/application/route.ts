import { NextRequest, NextResponse } from "next/server";
import { registryGetTenant } from "@/lib/sheets";
import {
  sheetReadSchedules,
  sheetReadApplications,
  sheetAppendApplication,
} from "@/lib/sheets";
import { parseCustomFields } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const scheduleItemId = request.nextUrl.searchParams.get("scheduleItemId");
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }
    const tenant = await registryGetTenant(tenantId);
    if (!tenant?.sheetId) {
      return NextResponse.json([]);
    }
    const applications = await sheetReadApplications(tenant.sheetId);
    const schedules = await sheetReadSchedules(tenant.sheetId);
    const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

    let list = applications.map((a) => {
      const scheduleId = a.일정ID ?? "";
      const schedule = scheduleMap.get(scheduleId);
      const data: Record<string, string> = {};
      Object.keys(a).forEach((k) => {
        if (!["일정ID", "일정명", "날짜", "시간", "신청일시"].includes(k)) data[k] = a[k];
      });
      return {
        id: scheduleId + "_" + (a.신청일시 ?? ""),
        data: JSON.stringify(data),
        createdAt: a.신청일시 ?? "",
        scheduleItem: {
          id: scheduleId,
          title: a.일정명 ?? "",
          dateStart: a.날짜 ?? "",
          timeLabel: a.시간 ?? null,
        },
      };
    });

    if (scheduleItemId) {
      list = list.filter((a) => a.scheduleItem.id === scheduleItemId);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json(list);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, scheduleItemId, selectedSlot, data } = body as {
      tenantId: string;
      scheduleItemId: string;
      selectedSlot?: { date: string; timeLabel?: string };
      data: Record<string, string | number>;
    };

    if (!tenantId || !scheduleItemId || typeof data !== "object") {
      return NextResponse.json(
        { error: "tenantId, scheduleItemId, data required" },
        { status: 400 }
      );
    }

    const tenant = await registryGetTenant(tenantId);
    if (!tenant?.sheetId) {
      return NextResponse.json({ error: "시트가 연결되지 않았습니다." }, { status: 400 });
    }

    const schedules = await sheetReadSchedules(tenant.sheetId);
    const schedule = schedules.find((s) => s.id === scheduleItemId);
    if (!schedule) {
      return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    }

    const slots = schedule.slots && schedule.slots.length > 0 ? schedule.slots : [{ date: schedule.dateStart.slice(0, 10), timeLabel: schedule.timeLabel ?? "" }];
    const slotDate = selectedSlot?.date ? String(selectedSlot.date).slice(0, 10) : slots[0].date;
    const slotTimeLabel = selectedSlot?.timeLabel !== undefined ? String(selectedSlot.timeLabel ?? "") : slots[0].timeLabel;
    if (slots.length > 1) {
      const found = slots.some((s) => s.date.slice(0, 10) === slotDate && (s.timeLabel ?? "") === slotTimeLabel);
      if (!found) {
        return NextResponse.json({ error: "선택한 일시가 이 일정에 없습니다." }, { status: 400 });
      }
    }

    const applications = await sheetReadApplications(tenant.sheetId);
    const slotCount = applications.filter(
      (a) => (a.일정ID ?? "") === scheduleItemId && (a.날짜 ?? "").slice(0, 10) === slotDate && (a.시간 ?? "") === slotTimeLabel
    ).length;
    if (slotCount >= schedule.maxCapacity) {
      return NextResponse.json({ error: "선택한 일시는 마감되었습니다." }, { status: 400 });
    }
    const now = new Date();
    if (schedule.applyUntil && now > new Date(schedule.applyUntil)) {
      return NextResponse.json({ error: "해당 일정의 신청 기간이 마감되었습니다." }, { status: 400 });
    }

    const fields = parseCustomFields(schedule.customFields);
    for (const f of fields) {
      if (f.required && (data[f.id] === undefined || String(data[f.id]).trim() === "")) {
        return NextResponse.json(
          { error: `"${f.label}"을(를) 입력해 주세요.` },
          { status: 400 }
        );
      }
    }

    const toSingleValue = (v: unknown): string => {
      if (v === undefined || v === null) return "";
      if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
      return String(v);
    };

    const headers = ["일정ID", "일정명", "날짜", "시간", "신청일시", ...fields.map((f) => f.label)];
    const row = [
      scheduleItemId,
      schedule.title,
      slotDate,
      slotTimeLabel,
      new Date().toISOString(),
      ...fields.map((f) => toSingleValue(data[f.id])),
    ];
    await sheetAppendApplication(tenant.sheetId, headers, row);

    return NextResponse.json({ success: true, id: scheduleItemId + "_" + Date.now() });
  } catch (e) {
    const err = e as { message?: string };
    const msg = String(err?.message ?? e);
    console.error("[POST /api/application]", e);
    if (msg.includes("403") || msg.includes("PERMISSION_DENIED") || msg.includes("Forbidden")) {
      return NextResponse.json(
        { error: "연결한 구글 시트에 저장할 권한이 없어요. 시트를 서비스 계정 이메일(앱 첫 화면·시트 연결 탭에 표시)에 [편집자]로 공유했는지 확인해 주세요." },
        { status: 500 }
      );
    }
    if (msg.includes("404") || msg.includes("NOT_FOUND")) {
      return NextResponse.json({ error: "연결한 시트를 찾을 수 없어요. 시트 연결 탭에서 다시 연결해 보세요." }, { status: 500 });
    }
    return NextResponse.json(
      { error: "시트에 저장하지 못했어요. 시트 연결·공유 설정을 확인한 뒤 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
