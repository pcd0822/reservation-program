import { NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * 등록 시트·서비스 계정 연동 상태를 확인합니다.
 * 브라우저에서 /api/check-registry 로 열어보면 원인 파악에 도움이 됩니다.
 */
export async function GET() {
  const result: { ok: boolean; error?: string; hint?: string } = { ok: false };

  try {
    const rawId = process.env.REGISTRY_SHEET_ID?.trim();
    if (!rawId) {
      result.error = "REGISTRY_SHEET_ID가 설정되지 않았어요.";
      result.hint = "Netlify 환경 변수에 등록용 시트 ID를 넣었는지 확인해 주세요.";
      return NextResponse.json(result);
    }

    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!key) {
      result.error = "GOOGLE_SERVICE_ACCOUNT_KEY가 설정되지 않았어요.";
      result.hint = "Netlify 환경 변수에 서비스 계정 JSON을 넣었는지 확인해 주세요.";
      return NextResponse.json(result);
    }

    let credentials: unknown;
    try {
      credentials = JSON.parse(key);
    } catch {
      result.error = "GOOGLE_SERVICE_ACCOUNT_KEY가 올바른 JSON이 아니에요.";
      result.hint = "따옴표나 줄바꿈이 빠지지 않았는지, 한 줄로 들어갔는지 확인해 주세요.";
      return NextResponse.json(result);
    }

    const match = rawId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = match ? match[1] : rawId;

    const auth = new google.auth.GoogleAuth({
      credentials: credentials as Record<string, unknown>,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A1:B1",
    });

    result.ok = true;
    return NextResponse.json(result);
  } catch (e) {
    const err = e as { code?: number; message?: string };
    const msg = String(err?.message ?? e);

    if (msg.includes("403") || msg.includes("PERMISSION_DENIED") || msg.includes("Forbidden")) {
      result.error = "등록 시트에 접근할 수 없어요 (권한 없음).";
      result.hint = "등록용 구글 시트를 서비스 계정 이메일로 [편집자] 권한 공유했는지 확인해 주세요.";
    } else if (msg.includes("404") || msg.includes("NOT_FOUND")) {
      result.error = "시트를 찾을 수 없어요.";
      result.hint = "REGISTRY_SHEET_ID가 올바른 시트 ID인지, 링크에서 /d/ 와 /edit 사이 부분만 넣었는지 확인해 주세요.";
    } else {
      result.error = msg.slice(0, 200);
      result.hint = "Netlify 로그(Deploys → 함수 로그)에서 자세한 오류를 확인할 수 있어요.";
    }
    return NextResponse.json(result);
  }
}
