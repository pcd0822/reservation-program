import { google } from "googleapis";

const SCHEDULE_SHEET_NAME = "일정";

const SCHEDULE_HEADERS = [
  "Id",
  "Title",
  "Type",
  "DateStart",
  "DateEnd",
  "TimeLabel",
  "MaxCapacity",
  "ApplyUntil",
  "ApplyFrom",
  "CustomFields",
  "Slots",
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

/** 특정 스프레드시트의 첫 시트 이름(예: Sheet1, 시트1). 범위용으로 따옴표 이스케이프 */
async function getFirstSheetName(spreadsheetId: string): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });
  const title = res.data.sheets?.[0]?.properties?.title ?? "Sheet1";
  return title.replace(/'/g, "''");
}

export function extractSheetIdFromUrl(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// ----- 등록 시트 (tenantId <-> sheetId <-> adminKey) -----
// 열 구성: A TenantId · B SheetId · C AdminKey
// AdminKey 는 관리자 화면·쓰기 API 를 여는 비밀 키다. 학생 링크(/s/ID)에는 들어가지 않는다.
// 예전에 만든 일정 묶음은 C 열이 비어 있을 수 있다(관리자 화면에서 발급).

const REGISTRY_HEADER = ["TenantId", "SheetId", "AdminKey"];

/** 머리글이 없으면 A1:C1 을 쓰고, 예전 2열 머리글이면 C1 만 채운다 */
async function ensureRegistryHeader(sheetName: string): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const registryId = getRegistrySheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: registryId,
    range: `'${sheetName}'!A1:C1`,
  });
  const row0 = (res.data.values?.[0] ?? []) as string[];
  if (row0.length === 0 || row0[0] === "") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: registryId,
      range: `'${sheetName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [REGISTRY_HEADER] },
    });
  } else if (row0[0] === "TenantId" && row0[2] !== "AdminKey") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: registryId,
      range: `'${sheetName}'!C1`,
      valueInputOption: "RAW",
      requestBody: { values: [["AdminKey"]] },
    });
  }
}

export async function registryAppendTenant(tenantId: string, adminKey: string): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const registryId = getRegistrySheetId();
  const sheetName = await getRegistryFirstSheetName();
  await ensureRegistryHeader(sheetName);
  await sheets.spreadsheets.values.append({
    spreadsheetId: registryId,
    range: `'${sheetName}'!A:C`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[tenantId, "", adminKey]] },
  });
}

/** 등록 시트에서 tenant 행 번호(1부터)를 찾는다 */
async function findRegistryRow(sheetName: string, tenantId: string): Promise<number | null> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getRegistrySheetId(),
    range: `'${sheetName}'!A:A`,
  });
  const rows = (res.data.values ?? []) as string[][];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === tenantId) return i + 1;
  }
  return null;
}

export async function registryUpdateSheetId(tenantId: string, sheetId: string): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = await getRegistryFirstSheetName();
  const row = await findRegistryRow(sheetName, tenantId);
  if (!row) throw new Error("Tenant not found in registry");
  await sheets.spreadsheets.values.update({
    spreadsheetId: getRegistrySheetId(),
    range: `'${sheetName}'!B${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[sheetId]] },
  });
}

/** 예전 일정 묶음(키 없음)에 관리자 키를 처음 한 번 기록한다. 이미 키가 있으면 false */
export async function registrySetAdminKeyIfEmpty(tenantId: string, adminKey: string): Promise<boolean> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = await getRegistryFirstSheetName();
  await ensureRegistryHeader(sheetName);
  const row = await findRegistryRow(sheetName, tenantId);
  if (!row) throw new Error("Tenant not found in registry");
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: getRegistrySheetId(),
    range: `'${sheetName}'!C${row}`,
  });
  if (String(current.data.values?.[0]?.[0] ?? "").trim()) return false;
  await sheets.spreadsheets.values.update({
    spreadsheetId: getRegistrySheetId(),
    range: `'${sheetName}'!C${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[adminKey]] },
  });
  return true;
}

/** tenant가 있으면 { sheetId, adminKey }, 없으면 null. adminKey 는 서버 안에서만 쓰고 응답에 싣지 않는다 */
export async function registryGetTenant(
  tenantId: string
): Promise<{ sheetId: string | null; adminKey: string | null } | null> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const registryId = getRegistrySheetId();
  const sheetName = await getRegistryFirstSheetName();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: registryId,
    range: `'${sheetName}'!A:C`,
  });
  const rows = (res.data.values ?? []) as string[][];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === tenantId) {
      return { sheetId: rows[i][1]?.trim() || null, adminKey: rows[i][2]?.trim() || null };
    }
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
    range: `'${SCHEDULE_SHEET_NAME}'!A1:K1`,
  });
  const existing = (res.data.values?.[0] ?? []) as string[];
  if (existing.length === 0 || existing[0] === "") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${SCHEDULE_SHEET_NAME}'!A1:K1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [SCHEDULE_HEADERS] },
    });
  }
}

export type ScheduleSlot = { date: string; timeLabel: string };

function normalizeSlotDate(val: unknown): string {
  if (val == null || val === "") return "";
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) {
    const d = n > 1e12 ? new Date(n) : new Date((n - 25569) * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** dateStart~dateEnd 구간을 YYYY-MM-DD 배열로 확장 (시트에 Slots가 없을 때 사용) */
function expandDateRange(dateStart: string, dateEnd: string): string[] {
  const dStart = normalizeSlotDate(dateStart) || String(dateStart ?? "").trim().slice(0, 10);
  const dEnd = normalizeSlotDate(dateEnd) || String(dateEnd ?? "").trim().slice(0, 10);
  if (!dStart || !/^\d{4}-\d{2}-\d{2}$/.test(dStart)) return [];
  if (!dEnd || dEnd < dStart) return [dStart];
  const out: string[] = [];
  const startMs = new Date(dStart + "T12:00:00Z").getTime();
  const endMs = new Date(dEnd + "T12:00:00Z").getTime();
  const dayMs = 86400000;
  for (let t = startMs; t <= endMs; t += dayMs) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function parseSlots(slotsJson: string | undefined, dateStart: string, dateEnd: string, timeLabel: string | null): ScheduleSlot[] {
  const d = normalizeSlotDate(dateStart) || dateStart.slice(0, 10);
  const tl = timeLabel ?? "";
  if (!slotsJson?.trim()) {
    const expanded = expandDateRange(dateStart, dateEnd);
    if (expanded.length > 0) return expanded.map((date) => ({ date, timeLabel: tl }));
    return [{ date: d, timeLabel: tl }];
  }
  try {
    const arr = JSON.parse(slotsJson) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) {
      const expanded = expandDateRange(dateStart, dateEnd);
      if (expanded.length > 0) return expanded.map((date) => ({ date, timeLabel: tl }));
      return [{ date: d, timeLabel: tl }];
    }
    return arr.map((x) => {
      const raw = (x as { date?: unknown }).date;
      const date = normalizeSlotDate(raw) || String(raw ?? "").slice(0, 10);
      return { date, timeLabel: String((x as { timeLabel?: string }).timeLabel ?? "") };
    }).filter((s) => s.date);
  } catch {
    const expanded = expandDateRange(dateStart, dateEnd);
    if (expanded.length > 0) return expanded.map((date) => ({ date, timeLabel: tl }));
    return [{ date: d, timeLabel: tl }];
  }
}

export async function sheetReadSchedules(sheetId: string): Promise<
  {
    id: string;
    title: string;
    groupTitle?: string | null;
    type: string;
    dateStart: string;
    dateEnd: string;
    timeLabel: string | null;
    maxCapacity: number;
    applyUntil: string | null;
    applyFrom: string | null;
    customFields: string;
    slots: ScheduleSlot[];
  }[]
> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  let rows: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${SCHEDULE_SHEET_NAME}'!A2:L`,
    });
    rows = (res.data.values ?? []) as string[][];
  } catch {
    return [];
  }
  return rows
    .filter((r) => r[0]?.trim())
    .map((r) => {
      const dateStart = r[3] ?? "";
      const timeLabel = r[5]?.trim() || null;
      const parseDateCell = (val: unknown): string | null => {
        if (val == null || val === "") return null;
        if (typeof val === "number" && Number.isFinite(val)) {
          const ms = val > 1e12 ? val : (val - 25569) * 86400 * 1000;
          return new Date(ms).toISOString();
        }
        const s = String(val).trim();
        if (!s) return null;
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      };
      // 시트 컬럼 고정 인덱스:
      // A Id(0), B Title(1), C Type(2), D DateStart(3), E DateEnd(4), F TimeLabel(5),
      // G MaxCapacity(6), H ApplyUntil(7), I ApplyFrom(8), J CustomFields(9), K Slots(10), L GroupTitle(11)
      const applyFrom = parseDateCell(r[8]);
      const applyUntil = parseDateCell(r[7]);
      const customFields = (r[9] ?? "[]") as string;
      const slotsJson = r[10] ?? "";
      const dateEnd = r[4] ?? "";
      const slots = parseSlots(slotsJson, dateStart, dateEnd, timeLabel);
      const groupTitle = r[11] != null && String(r[11]).trim() !== "" ? String(r[11]).trim() : null;
      return {
        id: r[0] ?? "",
        title: r[1] ?? "",
        groupTitle: groupTitle ?? undefined,
        type: r[2] ?? "day",
        dateStart,
        dateEnd: r[4] ?? "",
        timeLabel,
        maxCapacity: Math.max(1, parseInt(r[6], 10) || 1),
        applyUntil,
        applyFrom,
        customFields,
        slots,
      };
    });
}

export async function sheetAppendSchedule(
  sheetId: string,
  row: {
    id: string;
    title: string;
    groupTitle?: string | null;
    type: string;
    dateStart: string;
    dateEnd: string;
    timeLabel: string | null;
    maxCapacity: number;
    applyUntil: string | null;
    applyFrom?: string | null;
    customFields: string;
    slots?: ScheduleSlot[];
  }
): Promise<void> {
  await ensureScheduleTab(sheetId);
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const slotsJson =
    row.slots && row.slots.length > 0
      ? JSON.stringify(row.slots.map((s) => ({ date: s.date.slice(0, 10), timeLabel: s.timeLabel ?? "" })))
      : "";
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${SCHEDULE_SHEET_NAME}'!A1`,
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
          row.applyFrom ?? "",
          row.customFields,
          slotsJson,
          row.groupTitle ?? "",
        ],
      ],
    },
  });
}

export async function sheetUpdateSchedule(
  sheetId: string,
  scheduleId: string,
  row: {
    title: string;
    groupTitle?: string | null;
    type: string;
    dateStart: string;
    dateEnd: string;
    timeLabel: string | null;
    maxCapacity: number;
    applyUntil: string | null;
    applyFrom?: string | null;
    customFields: string;
    slots?: ScheduleSlot[];
  }
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${SCHEDULE_SHEET_NAME}'!A2:L`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const rowIndex = rows.findIndex((r) => r[0] === scheduleId);
  if (rowIndex < 0) return;
  const slotsJson =
    row.slots && row.slots.length > 0
      ? JSON.stringify(row.slots.map((s) => ({ date: s.date.slice(0, 10), timeLabel: s.timeLabel ?? "" })))
      : "";
  const range = `'${SCHEDULE_SHEET_NAME}'!B${rowIndex + 2}:L${rowIndex + 2}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          row.title,
          row.type,
          row.dateStart,
          row.dateEnd,
          row.timeLabel ?? "",
          String(row.maxCapacity),
          row.applyUntil ?? "",
          row.applyFrom ?? "",
          row.customFields,
          slotsJson,
          row.groupTitle ?? "",
        ],
      ],
    },
  });
}

function getApplicationSheetName(scheduleId: string): string {
  const safe = String(scheduleId).replace(/[:\\/?*[\]]/g, "_").slice(0, 28);
  return `신청_${safe}`;
}

/** 일정별 신청 시트를 생성하고 행을 추가 */
async function ensureApplicationSheet(sheetId: string, scheduleId: string): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const targetName = getApplicationSheetName(scheduleId);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === targetName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: targetName } } }],
      },
    });
  }
  return targetName.replace(/'/g, "''");
}

/** 신청 시트(일정별)를 삭제하거나, 구 시트 형식이면 해당 일정 행들을 삭제 */
async function sheetDeleteApplicationsByScheduleId(sheetId: string, scheduleId: string): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const targetName = getApplicationSheetName(scheduleId);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const scheduleSheet = meta.data.sheets?.find((s) => s.properties?.title === targetName);
  if (scheduleSheet?.properties?.sheetId !== undefined) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: scheduleSheet.properties.sheetId } }],
      },
    });
    return;
  }
  const appSheetName = (meta.data.sheets?.[0]?.properties?.title ?? "Sheet1").replace(/'/g, "''");
  let rows: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${appSheetName}'!A:A`,
    });
    rows = (res.data.values ?? []) as string[][];
  } catch {
    return;
  }
  if (rows.length < 2) return;
  const indicesToDelete: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const rowId = rows[i]?.[0]?.trim();
    if (rowId === scheduleId) indicesToDelete.push(i);
  }
  if (indicesToDelete.length === 0) return;
  const appSheet = meta.data.sheets?.[0];
  const appSheetIdNum = appSheet?.properties?.sheetId;
  if (appSheetIdNum === undefined) return;
  indicesToDelete.sort((a, b) => b - a);
  const requests = indicesToDelete.map((idx0) => ({
    deleteDimension: {
      range: {
        sheetId: appSheetIdNum,
        dimension: "ROWS",
        startIndex: idx0,
        endIndex: idx0 + 1,
      },
    },
  }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests },
  });
}

export async function sheetDeleteSchedule(sheetId: string, scheduleId: string): Promise<void> {
  await sheetDeleteApplicationsByScheduleId(sheetId, scheduleId);
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

// ----- 사용자 시트: 신청 탭 (일정별 시트) -----

export async function sheetReadApplications(
  sheetId: string,
  scheduleId?: string
): Promise<{ 일정ID: string; 일정명: string; 날짜: string; 시간: string; 신청일시: string; [key: string]: string }[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const prefix = "신청_";
  let targetSheets = meta.data.sheets?.filter((s) => {
    const t = s.properties?.title ?? "";
    return t.startsWith(prefix);
  }) ?? [];
  if (targetSheets.length === 0 && !scheduleId) {
    const first = meta.data.sheets?.[0];
    if (first) targetSheets = [first];
  }
  const result: { 일정ID: string; 일정명: string; 날짜: string; 시간: string; 신청일시: string; [key: string]: string }[] = [];
  for (const s of targetSheets) {
    const name = s.properties?.title ?? "";
    const isScheduleSheet = name.startsWith(prefix);
    const sheetSid = isScheduleSheet ? name.slice(prefix.length) : "";
    if (scheduleId && isScheduleSheet) {
      const expectedSuffix = scheduleId.replace(/[:\\/?*[\]]/g, "_").slice(0, 28);
      if (sheetSid !== expectedSuffix) continue;
    }
    const escaped = name.replace(/'/g, "''");
    let rows: string[][];
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
          range: `'${escaped}'!A:ZZ`,
      });
      rows = (res.data.values ?? []) as string[][];
    } catch {
      continue;
    }
    if (rows.length < 2) continue;
    const headers = rows[0].map((h) => String(h ?? "").trim());
    const sidCol = headers.indexOf("일정ID");
    const resolvedId = sidCol >= 0 && rows[1]?.[sidCol] ? String(rows[1][sidCol]) : sheetSid;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.[0]?.trim() && !row?.[1]?.trim()) continue;
      const obj: Record<string, string> = { 일정ID: resolvedId, 일정명: "", 날짜: "", 시간: "", 신청일시: "" };
      headers.forEach((h, j) => {
        obj[h] = row[j] != null ? String(row[j]) : "";
      });
      obj.일정ID = obj.일정ID || resolvedId;
      result.push(obj as { 일정ID: string; 일정명: string; 날짜: string; 시간: string; 신청일시: string; [key: string]: string });
    }
  }
  return result;
}

export async function sheetAppendApplication(
  sheetId: string,
  scheduleId: string,
  headers: string[],
  row: (string | number)[]
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const appSheetName = await ensureApplicationSheet(sheetId, scheduleId);

  const columnToLetter = (n: number): string => {
    // 1 -> A, 26 -> Z, 27 -> AA ...
    let num = Math.max(1, Math.floor(n));
    let out = "";
    while (num > 0) {
      const r = (num - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      num = Math.floor((num - 1) / 26);
    }
    return out;
  };

  // 기존 헤더 1행을 넉넉히 읽고, 새로 들어온 headers가 있으면 합쳐서 항상 최신 상태로 갱신
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${appSheetName}'!A1:ZZ1`,
  });
  const existing = (res.data.values?.[0] ?? []) as string[];
  const existingHeaders = existing.map((h) => String(h ?? "").trim()).filter((h) => h.length > 0);

  const finalHeaders = [...existingHeaders];
  for (const h of headers) {
    const hh = String(h ?? "").trim();
    if (!hh) continue;
    if (!finalHeaders.includes(hh)) finalHeaders.push(hh);
  }

  const lastCol = columnToLetter(finalHeaders.length);
  // 헤더가 달라졌으면 1행을 갱신 (빈 경우 포함)
  const needsHeaderUpdate =
    finalHeaders.length !== existingHeaders.length ||
    finalHeaders.some((h, i) => (existingHeaders[i] ?? "") !== h);

  if (needsHeaderUpdate) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${appSheetName}'!A1:${lastCol}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [finalHeaders] },
    });
  }

  // append할 때 row 값이 최종 헤더 인덱스에 정확히 들어가도록 정렬
  const headerIndex: Record<string, number> = {};
  finalHeaders.forEach((h, i) => {
    if (headerIndex[h] === undefined) headerIndex[h] = i;
  });
  const alignedRow = Array.from({ length: finalHeaders.length }, () => "");
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] ?? "").trim();
    const idx = headerIndex[h];
    if (idx === undefined) continue;
    alignedRow[idx] = row[i] === undefined || row[i] === null ? "" : String(row[i]);
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${appSheetName}'!A:${lastCol}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [alignedRow] },
  });
}
