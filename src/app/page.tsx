"use client";

import { useState } from "react";
import { CalendarDays, PlusCircle, Link2, Sparkles } from "lucide-react";

export default function HomePage() {
  const [linkId, setLinkId] = useState("");
  const [creating, setCreating] = useState(false);
  const [showExistingLink, setShowExistingLink] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      let data: { adminUrl?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (res.ok && data.adminUrl) {
        const url = data.adminUrl.startsWith("http") ? data.adminUrl : `${window.location.origin}${data.adminUrl}`;
        window.location.href = url;
        return;
      }
      setError(data.error || (res.ok ? "일정을 만들지 못했어요." : "서버 오류가 났어요. 아래 연동 확인 링크로 원인을 확인해 보세요."));
    } catch {
      setError("네트워크 오류가 났어요. 다시 시도해 주세요.");
    } finally {
      setCreating(false);
    }
  };

  const isGoogleSheetUrl = (text: string) =>
    /docs\.google\.com\/spreadsheets\//i.test(text) || /spreadsheets\.google\.com/i.test(text);

  const goAdmin = () => {
    const trimmed = linkId.trim();
    if (!trimmed) return;
    if (isGoogleSheetUrl(trimmed)) {
      alert("구글 스프레드시트 링크는 여기가 아니에요.\n\n먼저 아래 '새 일정 만들기'를 누른 뒤, 관리자 페이지의 '시트 연결' 탭에 구글 시트 링크를 넣어 주세요.");
      return;
    }
    const id = trimmed.replace(/.*\/(a|s)\//, "").replace(/\/$/, "").trim() || trimmed;
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      alert("관리자 페이지 링크 또는 ID만 입력해 주세요.\n예: https://사이트주소/a/abc123 또는 abc123");
      return;
    }
    window.location.href = `/a/${id}`;
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-gradient-to-br from-pastel-cream via-pastel-lavender/30 to-pastel-mint/30">
      <div className="w-full max-w-md card-soft p-8 md:p-10 text-center space-y-6">
        <div className="flex justify-center gap-2 text-pastel-pink">
          <CalendarDays className="w-10 h-10" strokeWidth={1.5} />
          <Sparkles className="w-6 h-6 self-end mb-1" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
          일정 예약 프로그램
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          버튼을 누르면 바로 관리자 페이지로 이동해요. 거기서 구글 시트 연결과 일정을 만들 수 있어요.
        </p>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-2xl px-3 py-2 space-y-1">
            <p>{error}</p>
            <p className="text-gray-600">
              <a href="/api/check-registry" target="_blank" rel="noopener noreferrer" className="underline">
                연동 확인 (원인 진단)
              </a>
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="btn-bounce w-full rounded-2xl bg-pastel-pink px-4 py-4 font-bold text-gray-800 shadow-md hover:shadow-lg disabled:opacity-70 text-lg flex items-center justify-center gap-2"
        >
          <PlusCircle className="w-6 h-6 shrink-0" strokeWidth={2} />
          {creating ? "만드는 중…" : "새 일정 만들기"}
        </button>

        <div className="pt-2 border-t border-pastel-lavender/50">
          <button
            type="button"
            onClick={() => setShowExistingLink(!showExistingLink)}
            className="text-sm text-gray-500 hover:text-gray-700 underline inline-flex items-center gap-1"
          >
            <Link2 className="w-4 h-4" strokeWidth={1.5} />
            {showExistingLink ? "접기" : "이미 만든 관리자 링크가 있어요"}
          </button>
          {showExistingLink && (
            <div className="mt-3 space-y-2 text-left">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="예: https://사이트주소/a/abc123"
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && goAdmin()}
                  className="flex-1 rounded-2xl border-2 border-pastel-lavender px-4 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-pastel-pink focus:outline-none"
                />
                <button
                  type="button"
                  onClick={goAdmin}
                  className="btn-bounce rounded-2xl bg-pastel-mint px-4 py-2 text-sm font-bold text-gray-800"
                >
                  이동
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
