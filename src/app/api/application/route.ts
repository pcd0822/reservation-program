import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appendRowToSheet, ensureHeaderRow } from "@/lib/sheets";
import { parseCustomFields } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  const scheduleItemId = request.nextUrl.searchParams.get("scheduleItemId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  const where: { tenantId: string; scheduleItemId?: string } = { tenantId };
  if (scheduleItemId) where.scheduleItemId = scheduleItemId;

  const list = await prisma.application.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      scheduleItem: {
        select: { id: true, title: true, dateStart: true, timeLabel: true },
      },
    },
  });
  return NextResponse.json(list);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, scheduleItemId, data } = body as {
      tenantId: string;
      scheduleItemId: string;
      data: Record<string, string | number>;
    };

    if (!tenantId || !scheduleItemId || typeof data !== "object") {
      return NextResponse.json(
        { error: "tenantId, scheduleItemId, data required" },
        { status: 400 }
      );
    }

    const schedule = await prisma.scheduleItem.findFirst({
      where: { id: scheduleItemId, tenantId },
      include: { _count: { select: { applications: true } } },
    });
    if (!schedule) {
      return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    }
    if (schedule._count.applications >= schedule.maxCapacity) {
      return NextResponse.json({ error: "해당 일정은 마감되었습니다." }, { status: 400 });
    }
    const now = new Date();
    if (schedule.applyUntil && now > schedule.applyUntil) {
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

    const application = await prisma.application.create({
      data: {
        tenantId,
        scheduleItemId,
        data: JSON.stringify(data),
      },
      include: {
        scheduleItem: true,
        tenant: true,
      },
    });

    const tenant = application.tenant;
    if (tenant.sheetId) {
      try {
        // 한 행 = 한 명의 신청. 같은 일정에 N명이 신청하면 N행이 추가되며, 각 셀에는 하나의 값만 저장.
        const headers = ["일정명", "날짜", "시간", "신청일시", ...fields.map((f) => f.label)];
        await ensureHeaderRow(tenant.sheetId, headers);
        const toSingleValue = (v: unknown): string => {
          if (v === undefined || v === null) return "";
          if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
          return String(v);
        };
        const row = [
          application.scheduleItem.title,
          application.scheduleItem.dateStart.toISOString().slice(0, 10),
          application.scheduleItem.timeLabel ?? "",
          new Date().toISOString(),
          ...fields.map((f) => toSingleValue(data[f.id])),
        ];
        await appendRowToSheet(tenant.sheetId, row);
      } catch (sheetError) {
        console.error("Google Sheet append error:", sheetError);
      }
    }

    return NextResponse.json({
      success: true,
      id: application.id,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
