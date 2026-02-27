import { NextRequest, NextResponse } from "next/server";
import { generateToken } from "@/lib/utils";
import {
  extractSheetIdFromUrl,
  registryAppendTenant,
  registryUpdateSheetId,
  registryGetTenant,
} from "@/lib/sheets";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id, sheetUrl } = body as {
      action: "create" | "connect";
      id?: string;
      sheetUrl?: string;
    };

    if (action === "create") {
      const tenantId = generateToken();
      await registryAppendTenant(tenantId);
      return NextResponse.json({
        id: tenantId,
        adminUrl: `/a/${tenantId}`,
        studentUrl: `/s/${tenantId}`,
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
      await registryUpdateSheetId(id, sheetId);
      return NextResponse.json({ success: true, sheetId });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (e) {
    const err = e as { message?: string };
    const msg = String(err?.message ?? e);
    console.error("[POST /api/tenant]", e);

    let error = "서버 오류가 났어요. REGISTRY_SHEET_ID와 구글 시트 연동을 확인해 주세요.";
    if (msg.includes("REGISTRY_SHEET_ID is not set")) {
      error = "REGISTRY_SHEET_ID가 설정되지 않았어요. Netlify 환경 변수를 확인해 주세요.";
    } else if (msg.includes("GOOGLE_SERVICE_ACCOUNT_KEY")) {
      error = "서비스 계정 키가 설정되지 않았거나 JSON 형식이 아니에요.";
    } else if (msg.includes("403") || msg.includes("PERMISSION_DENIED") || msg.includes("Forbidden")) {
      error = "등록 시트 권한이 없어요. 등록용 시트를 서비스 계정에 [편집자]로 공유해 주세요.";
    } else if (msg.includes("404") || msg.includes("NOT_FOUND")) {
      error = "등록 시트를 찾을 수 없어요. REGISTRY_SHEET_ID(시트 ID)가 맞는지 확인해 주세요.";
    }
    return NextResponse.json({ error }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const tenant = await registryGetTenant(id);
    if (!tenant) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ id, sheetId: tenant.sheetId });
  } catch (e) {
    const err = e as { message?: string };
    const msg = String(err?.message ?? e);
    console.error("[GET /api/tenant]", e);

    let error = "서버 오류가 났어요. REGISTRY_SHEET_ID와 구글 시트 연동을 확인해 주세요.";
    if (msg.includes("REGISTRY_SHEET_ID is not set")) {
      error = "REGISTRY_SHEET_ID가 설정되지 않았어요. Netlify 환경 변수를 확인해 주세요.";
    } else if (msg.includes("GOOGLE_SERVICE_ACCOUNT_KEY")) {
      error = "서비스 계정 키가 설정되지 않았거나 JSON 형식이 아니에요.";
    } else if (msg.includes("403") || msg.includes("PERMISSION_DENIED") || msg.includes("Forbidden")) {
      error = "등록 시트 권한이 없어요. 등록용 시트를 서비스 계정에 [편집자]로 공유해 주세요.";
    } else if (msg.includes("404") || msg.includes("NOT_FOUND")) {
      error = "등록 시트를 찾을 수 없어요. REGISTRY_SHEET_ID가 맞는지 확인해 주세요.";
    }
    return NextResponse.json({ error }, { status: 500 });
  }
}
