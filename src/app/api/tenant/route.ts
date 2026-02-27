import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateToken } from "@/lib/utils";
import { extractSheetIdFromUrl } from "@/lib/sheets";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id, sheetUrl } = body as {
      action: "create" | "connect";
      id?: string;
      sheetUrl?: string;
    };

    if (action === "create") {
      const tenant = await prisma.tenant.create({
        data: { id: generateToken() },
      });
      return NextResponse.json({
        id: tenant.id,
        adminUrl: `/a/${tenant.id}`,
        studentUrl: `/s/${tenant.id}`,
      });
    }

    if (action === "connect" && id && sheetUrl) {
      const sheetId = extractSheetIdFromUrl(sheetUrl);
      if (!sheetId) {
        return NextResponse.json(
          { error: "올바른 구글 스프레드시트 링크가 아닙니다. 공유 링크를 붙여넣어 주세요." },
          { status: 400 }
        );
      }
      await prisma.tenant.update({
        where: { id },
        data: { sheetId },
      });
      return NextResponse.json({ success: true, sheetId });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, sheetId: true, createdAt: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(tenant);
}
