"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { INDICATORS, IndicatorType, INDICATOR_TYPES, formatValue } from "@/lib/indicators";

interface AlertSetting {
  id: string;
  indicatorType: string;
  indicatorName: string;
  unit: string;
  threshold: number;
  direction: "ABOVE" | "BELOW";
  channel: "EMAIL" | "PUSH";
  isActive: boolean;
  currentValue: number | null;
  isTriggered: boolean;
  createdAt: string;
}

interface AlertHistory {
  id: string;
  indicatorType: string;
  value: number;
  threshold: number;
  direction: "ABOVE" | "BELOW";
  channel: "EMAIL" | "PUSH";
  sentAt: string;
}

const ALERTABLE_TYPES: IndicatorType[] = INDICATOR_TYPES.filter((t) =>
  ["BOK_BASE_RATE", "GOV_BOND_3Y", "KOSPI", "SP500", "CPI", "US_CPI", "KRW_USD", "VIX", "FEAR_GREED"].includes(t)
);

const CHANNEL_LABEL = { EMAIL: "이메일", PUSH: "웹 푸시" };
const DIR_LABEL = { ABOVE: "이상", BELOW: "이하" };

export default function AlertsPage() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<AlertSetting[]>([]);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    indicatorType: "VIX" as IndicatorType,
    threshold: "",
    direction: "ABOVE" as "ABOVE" | "BELOW",
    channel: "EMAIL" as "EMAIL" | "PUSH",
  });
  const [submitting, setSubmitting] = useState(false);

  async function fetchData() {
    const res = await fetch("/api/alerts");
    if (res.status === 401) { setUnauthorized(true); setLoading(false); return; }
    const data = await res.json();
    setSettings(data.settings ?? []);
    setHistory(data.history ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.threshold) return;
    setSubmitting(true);
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, threshold: parseFloat(form.threshold) }),
    });
    setForm((f) => ({ ...f, threshold: "" }));
    setSubmitting(false);
    fetchData();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    fetchData();
  }

  async function handleCheck() {
    setChecking(true);
    setCheckResult(null);
    const res = await fetch("/api/alerts/check", { method: "POST" });
    const data = await res.json();
    const count = data.triggered?.length ?? 0;
    setCheckResult(count > 0 ? `${count}개 알림이 발동되었습니다.` : "현재 발동된 알림이 없습니다.");
    setChecking(false);
    fetchData();
  }

  const selectedMeta = INDICATORS[form.indicatorType];

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-gray-400">불러오는 중...</p></div>;
  }

  if (unauthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
        <p className="text-gray-600 font-medium text-lg">로그인이 필요한 기능입니다.</p>
        <a href={`/login?callbackUrl=${encodeURIComponent(pathname)}`} className="bg-blue-500 text-white px-6 py-2.5 rounded-full font-medium hover:bg-blue-600 transition-colors">
          로그인 →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">지표 알림 설정</h1>
          <p className="text-sm text-gray-400 mt-0.5">임계값 초과 시 이메일 또는 웹 푸시로 알림을 받습니다.</p>
        </div>
        <button
          onClick={handleCheck}
          disabled={checking || settings.length === 0}
          className="text-sm bg-blue-500 text-white px-4 py-2 rounded-full hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {checking ? "확인 중..." : "지금 확인"}
        </button>
      </div>

      {checkResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          {checkResult}
        </div>
      )}

      {/* 알림 추가 폼 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-4">알림 추가</h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">지표</label>
              <select
                value={form.indicatorType}
                onChange={(e) => setForm((f) => ({ ...f, indicatorType: e.target.value as IndicatorType }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {ALERTABLE_TYPES.map((t) => (
                  <option key={t} value={t}>{INDICATORS[t].name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                임계값 {selectedMeta?.unit ? `(${selectedMeta.unit})` : ""}
              </label>
              <input
                type="number"
                step="any"
                placeholder={`예: ${selectedMeta?.anomalyThreshold?.value ?? "30"}`}
                value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">조건</label>
              <select
                value={form.direction}
                onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as "ABOVE" | "BELOW" }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="ABOVE">이상 (≥)</option>
                <option value="BELOW">이하 (≤)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">알림 채널</label>
              <select
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as "EMAIL" | "PUSH" }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="EMAIL">이메일</option>
                <option value="PUSH">웹 푸시</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {submitting ? "추가 중..." : "알림 추가"}
          </button>
        </form>
      </div>

      {/* 활성 알림 목록 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-4">활성 알림 ({settings.length})</h2>
        {settings.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">설정된 알림이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {settings.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between border rounded-xl px-4 py-3 ${
                  s.isTriggered ? "border-red-200 bg-red-50" : "border-gray-100"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{s.indicatorName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.isTriggered ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"
                    }`}>
                      {s.isTriggered ? "⚠ 발동 중" : "대기 중"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.threshold}{s.unit} {DIR_LABEL[s.direction]} → {CHANNEL_LABEL[s.channel]}
                    {s.currentValue != null && (
                      <span className="ml-2 text-gray-400">
                        현재: {formatValue(s.indicatorType as IndicatorType, s.currentValue)}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="ml-4 text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                  title="삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 알림 이력 */}
      {history.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">알림 이력</h2>
          <div className="space-y-2">
            {history.map((h) => {
              const meta = INDICATORS[h.indicatorType as IndicatorType];
              return (
                <div key={h.id} className="flex items-start gap-3 text-sm border-b border-gray-50 pb-2 last:border-0">
                  <span className="text-orange-400 mt-0.5">🔔</span>
                  <div className="flex-1">
                    <p className="text-gray-700">
                      <span className="font-medium">{meta?.name ?? h.indicatorType}</span>가{" "}
                      {formatValue(h.indicatorType as IndicatorType, h.value)} 으로{" "}
                      임계값 {h.threshold}{meta?.unit ?? ""} {DIR_LABEL[h.direction]} 조건을 충족했습니다.
                    </p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {new Date(h.sentAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {CHANNEL_LABEL[h.channel]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        웹 푸시 알림은 브라우저 알림 권한 설정이 필요합니다. 이메일 알림은 가입한 이메일로 발송됩니다.
      </p>
    </div>
  );
}
