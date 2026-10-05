"use client";

/*
 * 관리자 키를 브라우저에 일정 묶음별로 기억해 두고, 관리자 API 요청에 x-admin-key 헤더로 붙인다.
 * 키는 관리자 링크(/a/ID?k=키)로 처음 들어올 때 저장된다.
 */
const keyName = (tenantId: string) => `reservation_admin_key_${tenantId}`;

export function getAdminKey(tenantId: string): string {
  try {
    return localStorage.getItem(keyName(tenantId)) ?? "";
  } catch {
    return "";
  }
}

export function saveAdminKey(tenantId: string, key: string): void {
  try {
    localStorage.setItem(keyName(tenantId), key);
  } catch {
    /* 저장 못 해도 이번 접속에서는 주소의 키로 동작한다 */
  }
}

export function adminUrl(tenantId: string, key: string): string {
  const path = `/a/${tenantId}`;
  return key ? `${path}?k=${encodeURIComponent(key)}` : path;
}

export function adminFetch(tenantId: string, input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const key = getAdminKey(tenantId);
  if (key) headers.set("x-admin-key", key);
  return fetch(input, { ...init, headers });
}
