"use client";

import { useState, useEffect } from "react";

type Props = { tenantId: string; sheetId: string | null; onConnected: () => void };

export function TabSheet({ tenantId, sheetId, onConnected }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [serviceEmail, setServiceEmail] = useState<string>("");

  useEffect(() => {
    fetch("/api/sheet-email")
      .then((r) => r.json())
      .then((d) => setServiceEmail(d.email || ""));
  }, []);

  const handleConnect = async () => {
    setError("");
    setSuccess(false);
    if (!url.trim()) {
      setError("구글 스프레드시트 공유 링크를 붙여넣어 주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", id: tenantId, sheetUrl: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "연결에 실패했습니다.");
        return;
      }
      setSuccess(true);
      onConnected();
    } catch {
      setError("연결 중 오류가 났어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-soft p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">구글 스프레드시트 연결</h2>
      <p className="text-gray-600 text-sm">
        학생들이 신청한 내역이 아래 구글 시트에 자동으로 저장됩니다. 시트의 <strong>공유 링크</strong>를 붙여넣어 주세요.
      </p>
      {serviceEmail && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-2xl p-3">
          시트를 <strong>편집자</strong> 권한으로 <strong>{serviceEmail}</strong> 에 공유해 주셔야 저장됩니다.
        </p>
      )}

      {sheetId ? (
        <div className="rounded-2xl bg-pastel-mint/40 p-4">
          <p className="font-medium text-gray-800">연결됨</p>
          <p className="text-sm text-gray-600 break-all mt-1">시트 ID: {sheetId}</p>
          <p className="text-sm text-gray-500 mt-2">다른 시트로 바꾸려면 새 링크를 입력하고 다시 연결하세요.</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">스프레드시트 링크</label>
        <input
          type="url"
          placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-2xl border-2 border-pastel-lavender px-4 py-3 text-gray-800 placeholder-gray-400 focus:border-pastel-pink focus:outline-none"
        />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {success && <p className="text-green-600 text-sm">연결되었어요!</p>}
      <button
        type="button"
        onClick={handleConnect}
        disabled={loading}
        className="btn-bounce rounded-2xl bg-pastel-pink px-6 py-3 font-medium text-gray-800 shadow-md hover:shadow-lg disabled:opacity-70"
      >
        {loading ? "연결 중…" : sheetId ? "다시 연결" : "연결하기"}
      </button>
    </div>
  );
}
