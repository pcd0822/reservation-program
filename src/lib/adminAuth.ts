import { randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { registryGetTenant } from "@/lib/sheets";

/** 관리자 키: 추측하기 어려운 32자 무작위 문자열 */
export function generateAdminKey(): string {
  return randomBytes(24).toString("base64url");
}

function sameKey(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

type Tenant = { sheetId: string | null; adminKey: string | null };

/**
 * 관리자 전용 API 앞에서 부른다. 요청 헤더 x-admin-key 가 등록 시트의 AdminKey 와 같아야 통과한다.
 * 예전에 만든 일정 묶음(AdminKey 비어 있음)은 키 발급 전까지 예전처럼 통과시키고 legacy 로 표시한다.
 */
export async function requireAdmin(
  request: NextRequest,
  tenantId: string
): Promise<{ ok: true; tenant: Tenant; legacy: boolean } | { ok: false; response: NextResponse }> {
  const tenant = await registryGetTenant(tenantId);
  if (!tenant) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (!tenant.adminKey) return { ok: true, tenant, legacy: true };
  const given = request.headers.get("x-admin-key")?.trim() ?? "";
  if (!given || !sameKey(given, tenant.adminKey)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "관리자 키가 없거나 맞지 않아요. 처음 받은 관리자 링크(키 포함)로 다시 들어와 주세요.", code: "ADMIN_KEY_REQUIRED" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, tenant, legacy: false };
}
