"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TabSheet } from "@/components/admin/TabSheet";
import { TabSchedules, type EditGroup } from "@/components/admin/TabSchedules";
import { TabApplications } from "@/components/admin/TabApplications";
import { TabScheduleManage } from "@/components/admin/TabScheduleManage";
import { adminFetch, adminUrl, getAdminKey, saveAdminKey } from "@/lib/adminClient";

type Tab = "sheet" | "schedules" | "applications" | "manage";

export default function AdminPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const searchParams = useSearchParams();
  const keyFromUrl = searchParams.get("k");
  const [tab, setTab] = useState<Tab>("sheet");
  const [tenant, setTenant] = useState<{ id: string; sheetId: string | null; legacy?: boolean } | null>(null);
  const [needKey, setNeedKey] = useState(false);
  const [adminLink, setAdminLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editGroup, setEditGroup] = useState<EditGroup | null>(null);

  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setApiError(null);
    // 관리자 링크(?k=키)로 들어오면 키를 이 브라우저에 기억해 둔다
    if (keyFromUrl) saveAdminKey(id, keyFromUrl);
    const key = keyFromUrl || getAdminKey(id);
    if (key) setAdminLink(`${window.location.origin}${adminUrl(id, key)}`);
    adminFetch(id, `/api/tenant?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.status === 401) {
          setNeedKey(true);
          setTenant(null);
          return;
        }
        if (!r.ok) {
          if (r.status === 404) {
            router.replace("/");
            return;
          }
          setApiError(data.error || "서버 오류가 났어요.");
          setTenant(null);
          return;
        }
        if (data.error) {
          router.replace("/");
          return;
        }
        setTenant(data);
        if (data.sheetId) setTab("schedules");
        try {
          localStorage.setItem("reservation_admin_id", id);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        setApiError("연결할 수 없어요. 네트워크를 확인해 주세요.");
        setTenant(null);
      })
      .finally(() => setLoading(false));
  }, [id, router, keyFromUrl]);

  // 예전에 만든 일정 묶음: 관리자 키를 처음 한 번 발급하고 새 관리자 링크를 보여 준다
  const issueKey = async () => {
    setIssuing(true);
    try {
      const r = await fetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issueKey", id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.adminKey) {
        alert(data.error || "관리자 키를 발급하지 못했어요.");
        return;
      }
      saveAdminKey(id, data.adminKey);
      setAdminLink(`${window.location.origin}${adminUrl(id, data.adminKey)}`);
      setTenant((t) => (t ? { ...t, legacy: false } : t));
    } finally {
      setIssuing(false);
    }
  };

  const copyAdminLink = () => {
    navigator.clipboard.writeText(adminLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  if (needKey) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-pastel-cream">
        <div className="card-soft p-6 max-w-md text-center space-y-4">
          <p className="text-gray-800 font-bold">관리자 키가 필요해요</p>
          <p className="text-sm text-gray-600">
            이 관리자 화면은 키가 붙은 관리자 링크로만 열려요. 일정을 만들 때 받은 관리자 링크(주소 끝에 <code>?k=</code> 가 붙은 것)로 다시 들어와 주세요.
            학생용 링크로는 관리자 화면을 열 수 없어요.
          </p>
          <Link href="/" className="btn-bounce inline-block rounded-2xl bg-pastel-pink px-4 py-2 font-bold text-gray-800">
            처음으로
          </Link>
        </div>
      </main>
    );
  }

  if (loading && !tenant && !apiError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-pastel-cream">
        <div className="text-gray-500">로딩 중…</div>
      </main>
    );
  }

  if (apiError) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-pastel-cream">
        <div className="card-soft p-6 max-w-md text-center space-y-4">
          <p className="text-red-600 font-medium">{apiError}</p>
          <p className="text-sm text-gray-600">환경 변수(GOOGLE_SERVICE_ACCOUNT_KEY, REGISTRY_SHEET_ID)와 등록 시트 공유 설정을 README에서 확인해 주세요.</p>
          <Link href="/" className="btn-bounce inline-block rounded-2xl bg-pastel-pink px-4 py-2 font-bold text-gray-800">
            처음으로
          </Link>
        </div>
      </main>
    );
  }

  if (!tenant) {
    return null;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "sheet", label: "시트 연결" },
    { key: "schedules", label: "일정 만들기" },
    { key: "applications", label: "신청내역 관리" },
    { key: "manage", label: "일정 관리" },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-pastel-cream via-pastel-lavender/20 to-pastel-mint/20">
      <header className="sticky top-0 z-10 border-b border-white/50 bg-white/80 backdrop-blur rounded-b-3xl shadow-sm relative">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/"
            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
          >
            ← 처음으로
          </Link>
          <div className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`btn-bounce rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-pastel-pink text-gray-800 shadow"
                    : "bg-pastel-lavender/60 text-gray-700 hover:bg-pastel-lavender"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <p className="absolute top-1/2 -translate-y-1/2 right-4 text-xs text-gray-400 pointer-events-none">Designed by Deulssam</p>
      </header>

      <div className="max-w-4xl mx-auto p-4 pb-12">
        {tenant.legacy ? (
          <div className="card-soft mb-4 space-y-2 border-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">이 일정은 예전 방식으로 만들어져 학생 링크로도 관리자 화면에 들어올 수 있어요.</p>
            <p>관리자 키를 발급하면 이후에는 키가 붙은 관리자 링크로만 이 화면이 열려요. 발급 후 새 관리자 링크를 꼭 저장해 두세요.</p>
            <button type="button" onClick={issueKey} disabled={issuing} className="btn-bounce rounded-2xl bg-pastel-pink px-4 py-2 font-bold text-gray-800 disabled:opacity-60">
              {issuing ? "발급 중…" : "관리자 키 발급하기"}
            </button>
          </div>
        ) : adminLink ? (
          <div className="card-soft mb-4 flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="font-medium text-gray-700">관리자 링크</span>
            <span className="text-xs text-gray-500">(학생에게 보내지 마세요 · 즐겨찾기에 저장해 두세요)</span>
            <input readOnly value={adminLink} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-xl border border-pastel-lavender bg-white px-3 py-1.5 text-xs text-gray-700" />
            <button type="button" onClick={copyAdminLink} className="btn-bounce rounded-xl bg-pastel-mint px-3 py-1.5 font-bold text-gray-800">
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
        ) : null}
        {tab === "sheet" && (
          <TabSheet tenantId={tenant.id} sheetId={tenant.sheetId} onConnected={() => adminFetch(id, `/api/tenant?id=${id}`).then(r=>r.json()).then(d=> setTenant(d))} />
        )}
        {tab === "schedules" && (
          <TabSchedules
            tenantId={tenant.id}
            editGroup={editGroup}
            onClearEdit={() => setEditGroup(null)}
          />
        )}
        {tab === "applications" && <TabApplications tenantId={tenant.id} />}
        {tab === "manage" && (
          <TabScheduleManage
            tenantId={tenant.id}
            onEditGroup={(group) => {
              setTab("schedules");
              setEditGroup(group);
            }}
          />
        )}
      </div>
    </main>
  );
}
