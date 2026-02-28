"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TabSheet } from "@/components/admin/TabSheet";
import { TabSchedules } from "@/components/admin/TabSchedules";
import { TabApplications } from "@/components/admin/TabApplications";
import { TabScheduleManage } from "@/components/admin/TabScheduleManage";

type Tab = "sheet" | "schedules" | "applications" | "manage";

export default function AdminPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [tab, setTab] = useState<Tab>("sheet");
  const [tenant, setTenant] = useState<{ id: string; sheetId: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setApiError(null);
    fetch(`/api/tenant?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
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
  }, [id, router]);

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
          <p className="text-sm text-gray-600">Netlify 등 서버리스 환경에서는 DB 설정이 필요해요. README를 확인해 주세요.</p>
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
        {tab === "sheet" && (
          <TabSheet tenantId={tenant.id} sheetId={tenant.sheetId} onConnected={() => fetch(`/api/tenant?id=${id}`).then(r=>r.json()).then(d=> setTenant(d))} />
        )}
        {tab === "schedules" && <TabSchedules tenantId={tenant.id} />}
        {tab === "applications" && <TabApplications tenantId={tenant.id} />}
        {tab === "manage" && <TabScheduleManage tenantId={tenant.id} />}
      </div>
    </main>
  );
}
