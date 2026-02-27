"use client";

import { useState } from "react";
import Link from "next/link";

export default function HomePage() {
  const [linkId, setLinkId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newLinks, setNewLinks] = useState<{
    id: string;
    adminUrl: string;
    studentUrl: string;
  } | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setNewLinks(null);
    try {
      const res = await fetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const data = await res.json();
      if (data.adminUrl) {
        setNewLinks({
          id: data.id,
          adminUrl: data.adminUrl,
          studentUrl: data.studentUrl,
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const goAdmin = () => {
    if (!linkId.trim()) return;
    const id = linkId.trim().replace(/.*\/(a|s)\//, "").replace(/\/$/, "") || linkId.trim();
    window.location.href = `/a/${id}`;
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-gradient-to-br from-pastel-cream via-pastel-lavender/30 to-pastel-mint/30">
      <div className="w-full max-w-md card-soft p-8 md:p-10 text-center space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 rounded-3xl">
          행사·청소·당번 예약
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          관리자 링크로 들어가 구글 시트를 연결하고, 일정을 만든 뒤 학생 링크를 공유하세요.
        </p>

        {!newLinks ? (
          <>
            <div className="space-y-2">
              <label className="block text-left text-sm font-medium text-gray-700">
                이미 관리자 링크가 있어요
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="링크 또는 ID 입력"
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && goAdmin()}
                  className="flex-1 rounded-2xl border-2 border-pastel-lavender px-4 py-3 text-gray-800 placeholder-gray-400 focus:border-pastel-pink focus:outline-none focus:ring-2 focus:ring-pastel-pink/30"
                />
                <button
                  type="button"
                  onClick={goAdmin}
                  className="btn-bounce rounded-2xl bg-pastel-mint px-5 py-3 font-medium text-gray-800 shadow-md hover:shadow-lg"
                >
                  이동
                </button>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="btn-bounce w-full rounded-2xl bg-pastel-pink px-4 py-4 font-medium text-gray-800 shadow-md hover:shadow-lg disabled:opacity-70"
              >
                {creating ? "만드는 중…" : "새 예약 공간 만들기"}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4 text-left">
            <p className="text-pastel-mint font-medium">생성되었어요!</p>
            <div className="rounded-2xl bg-pastel-cream/80 p-4 space-y-2">
              <p className="text-sm text-gray-600">관리자용 (일정·시트 연결)</p>
              <Link
                href={newLinks.adminUrl}
                className="block rounded-xl bg-pastel-lavender px-4 py-2 text-sm font-medium text-gray-800 break-all hover:bg-pastel-lavender/80"
              >
                {typeof window !== "undefined" ? window.location.origin + newLinks.adminUrl : newLinks.adminUrl}
              </Link>
              <p className="text-sm text-gray-600 mt-3">학생용 (신청)</p>
              <p className="rounded-xl bg-pastel-sky/80 px-4 py-2 text-sm text-gray-800 break-all">
                {typeof window !== "undefined" ? window.location.origin + newLinks.studentUrl : newLinks.studentUrl}
              </p>
            </div>
            <Link
              href={newLinks.adminUrl}
              className="btn-bounce block w-full rounded-2xl bg-pastel-pink py-3 font-medium text-center text-gray-800 shadow-md"
            >
              관리자 페이지로 가기
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
