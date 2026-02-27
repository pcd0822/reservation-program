import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }
  const list = await prisma.scheduleItem.findMany({
    where: { tenantId },
    orderBy: [{ dateStart: "asc" }, { timeLabel: "asc" }],
    include: {
      _count: { select: { applications: true } },
    },
  });
  return NextResponse.json(list);
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

    const item = await prisma.scheduleItem.create({
      data: {
        tenantId,
        title: title.trim(),
        type,
        dateStart: new Date(dateStart),
        dateEnd: new Date(dateEnd),
        timeLabel: timeLabel ?? null,
        maxCapacity: Math.max(1, Number(maxCapacity) || 1),
        applyUntil: applyUntil ? new Date(applyUntil) : null,
        customFields: typeof customFields === "string" ? customFields : JSON.stringify(customFields ?? []),
      },
    });
    return NextResponse.json(item);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await prisma.scheduleItem.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
