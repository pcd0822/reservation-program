import { google } from "googleapis";

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  }
  const credentials = JSON.parse(key);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return auth;
}

export function extractSheetIdFromUrl(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * 신청 1건당 1행을 추가합니다. 같은 일정에 여러 명이 신청하면 호출될 때마다 각각 한 행씩 추가되며,
 * 각 셀에는 하나의 값만 들어가 후속 데이터 관리(필터, 피벗 등)가 쉽습니다.
 */
export async function appendRowToSheet(
  sheetId: string,
  row: (string | number)[]
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Sheet1!A:Z",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

export async function ensureHeaderRow(
  sheetId: string,
  headers: string[]
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Sheet1!A1:Z1",
  });
  const existing = (res.data.values?.[0] ?? []) as string[];
  if (existing.length === 0 || existing[0] === "") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Sheet1!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
  }
}
