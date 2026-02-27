import { google } from "googleapis";

const SCHEDULE_SHEET_NAME = "일정";
const APPLICATION_SHEET_NAME = "Sheet1"; // 신청 = 첫 시트

const SCHEDULE_HEADERS = [
  "Id",
  "Title",
  "Type",
  "DateStart",
  "DateEnd",
  "TimeLabel",
  "MaxCapacity",
  "ApplyUntil",
  "CustomFields",
];

/** JSON의 private_key에서 이스케이프된 줄바꿈(\\n)을 실제 줄바꿈으로 복구 */
function normalizeServiceAccountKey(credentials: Record<string, unknown>): Record<string, unknown> {
  if (typeof credentials.private_key !== "string") return credentials;
  const pk = credentials.private_key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  return { ...credentials, private_key: pk };
}

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  const credentials = JSON.parse(key) as Record<string, unknown>;
  const normalized = normalizeServiceAccountKey(credentials);
  return new google.auth.GoogleAuth({
    credentials: normalized,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getRegistrySheetId(): string {
  const raw = process.env.REGISTRY_SHEET_ID?.trim();
  if (!raw) throw new Error("REGISTRY_SHEET_ID is not set. 앱용 등록 시트를 만들고 공유한 뒤 환경 변수에 넣어 주세요.");
  const fromUrl = extractSheetIdFromUrl(raw);
  if (fromUrl) return fromUrl;
  return raw;
}

/** 등록 시트의 첫 시트 이름(예: Sheet1, 시트1). 범위에 쓸 때 작은따옴표 이스케이프용 */
async function getRegistryFirstSheetName(): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const registryId = getRegistrySheetId();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: registryId,
    fields: "sheets(properties(title))",
  });
  const title = res.data.sheets?.[0]?.properties?.title ?? "Sheet1";
  return title.replace(/'/g, "''");
}

export function extractSheetIdFromUrl(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// ----- 등록 시트 (tenantId <-> sheetId) -----

export async function registryAppendTenant(tenantId: string): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const registryId = getRegistrySheetId();
  const sheetName = await getRegistryFirstSheetName();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: registryId,
    range: `'${sheetName}'!A1:B1`,
  });
  const row0 = (res.data.values?.[0] ?? []) as string[];
  if (row0.length === 0 || row0[0] === "") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: registryId,
      range: `'${sheetName}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["TenantId", "SheetId"]] },
    });
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: registryId,
    range: `'${sheetName}'!A:B`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[tenantId, ""]] },
  });
}

export async function registryUpdateSheetId(tenantId: string, sheetId: string): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const registryId = getRegistrySheetId();
  const sheetName = await getRegistryFirstSheetName();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: registryId,
    range: `'${sheetName}'!A:B`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const header = rows[0] ?? [];
  if (header[0] === "TenantId") {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === tenantId) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: registryId,
          range: `'${sheetName}'!B${i + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[sheetId]] },
        });
        return;
      }
    }
  }
  throw new Error("Tenant not found in registry");
}

/** tenant가 있으면 { sheetId }, 없으면 null */
export async function registryGetTenant(tenantId: string): Promise<{ sheetId: string | null } | null> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const registryId = getRegistrySheetId();
  const sheetName = await getRegistryFirstSheetName();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: registryId,
    range: `'${sheetName}'!A:B`,
  });
  const rows = (res.data.values ?? []) as string[][];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === tenantId) return { sheetId: rows[i][1]?.trim() || null };
  }
  return null;
}

// ----- 사용자 시트: 일정 탭 -----

async function ensureScheduleTab(sheetId: string): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const has = meta.data.sheets?.some((s) => s.properties?.title === SCHEDULE_SHEET_NAME);
  if (!has) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: SCHEDULE_SHEET_NAME },
            },
          },
        ],
      },
    });
  }
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${SCHEDULE_SHEET_NAME}'!A1:I1`,
  });
  const existing = (res.data.values?.[0] ?? []) as string[];
  if (existing.length === 0 || existing[0] === "") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${SCHEDULE_SHEET_NAME}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [SCHEDULE_HEADERS] },
    });
  }
}

export async function sheetReadSchedules(sheetId: string): Promise<
  {
    id: string;
    title: string;
    type: string;
    dateStart: string;
    dateEnd: string;
    timeLabel: string | null;
    maxCapacity: number;
    applyUntil: string | null;
    customFields: string;
  }[]
> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  let rows: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${SCHEDULE_SHEET_NAME}'!A2:I`,
    });
    rows = (res.data.values ?? []) as string[][];
  } catch {
    return [];
  }
  return rows
    .filter((r) => r[0]?.trim())
    .map((r) => ({
      id: r[0] ?? "",
      title: r[1] ?? "",
      type: r[2] ?? "day",
      dateStart: r[3] ?? "",
      dateEnd: r[4] ?? "",
      timeLabel: r[5]?.trim() || null,
      maxCapacity: Math.max(1, parseInt(r[6], 10) || 1),
      applyUntil: r[7]?.trim() || null,
      customFields: r[8] ?? "[]",
    }));
}

export async function sheetAppendSchedule(
  sheetId: string,
  row: {
    id: string;
    title: string;
    type: string;
    dateStart: string;
    dateEnd: string;
    timeLabel: string | null;
    maxCapacity: number;
    applyUntil: string | null;
    customFields: string;
  }
): Promise<void> {
  await ensureScheduleTab(sheetId);
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${SCHEDULE_SHEET_NAME}'!A:I`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          row.id,
          row.title,
          row.type,
          row.dateStart,
          row.dateEnd,
          row.timeLabel ?? "",
          String(row.maxCapacity),
          row.applyUntil ?? "",
          row.customFields,
        ],
      ],
    },
  });
}

export async function sheetDeleteSchedule(sheetId: string, scheduleId: string): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${SCHEDULE_SHEET_NAME}'!A2:A`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const rowIndex = rows.findIndex((r) => r[0] === scheduleId);
  if (rowIndex < 0) return;
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const scheduleSheet = sheetMeta.data.sheets?.find((s) => s.properties?.title === SCHEDULE_SHEET_NAME);
  const sheetIdNum = scheduleSheet?.properties?.sheetId;
  if (sheetIdNum === undefined) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetIdNum,
              dimension: "ROWS",
              startIndex: rowIndex + 1,
              endIndex: rowIndex + 2,
            },
          },
        },
      ],
    },
  });
}

// ----- 사용자 시트: 신청 탭 (첫 시트) -----

export async function sheetReadApplications(
  sheetId: string
): Promise<{ 일정ID: string; 일정명: string; 날짜: string; 시간: string; 신청일시: string; [key: string]: string }[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  let rows: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${APPLICATION_SHEET_NAME}!A:Z`,
    });
    rows = (res.data.values ?? []) as string[][];
  } catch {
    return [];
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h ?? "").trim());
  const result: { 일정ID: string; 일정명: string; 날짜: string; 시간: string; 신청일시: string; [key: string]: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.[0]?.trim()) continue;
    const obj: Record<string, string> = { 일정ID: "", 일정명: "", 날짜: "", 시간: "", 신청일시: "" };
    headers.forEach((h, j) => {
      obj[h] = row[j] != null ? String(row[j]) : "";
    });
    result.push(obj as { 일정ID: string; 일정명: string; 날짜: string; 시간: string; 신청일시: string; [key: string]: string });
  }
  return result;
}

export async function sheetAppendApplication(
  sheetId: string,
  headers: string[],
  row: (string | number)[]
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${APPLICATION_SHEET_NAME}!A1:Z1`,
  });
  const existing = (res.data.values?.[0] ?? []) as string[];
  if (existing.length === 0 || existing[0] === "") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${APPLICATION_SHEET_NAME}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${APPLICATION_SHEET_NAME}!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}
