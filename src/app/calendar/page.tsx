"use client";

import { useEffect, useState } from "react";
import { EventType, EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, Importance } from "@/lib/calendar";

interface CalendarEvent {
  key: string;
  date: string;
  type: EventType;
  title: string;
  description: string;
  importance: Importance;
  indicatorTypes?: string[];
  daysUntil: number;
  isPast: boolean;
  isFavorite: boolean;
}

const IMPORTANCE_LABEL: Record<Importance, string> = {
  HIGH: "주요",
  MEDIUM: "일반",
  LOW: "참고",
};

const ALL_TYPES: (EventType | "ALL")[] = ["ALL", "FOMC", "BOK_MPC", "US_CPI", "KR_CPI", "US_NFP", "KR_EMPLOYMENT"];
const FILTER_LABEL: Record<string, string> = {
  ALL: "전체",
  FOMC: "FOMC",
  BOK_MPC: "금통위",
  US_CPI: "미국 CPI",
  KR_CPI: "한국 CPI",
  US_NFP: "미국 고용",
  KR_EMPLOYMENT: "한국 고용",
};

function DDayBadge({ daysUntil, isPast }: { daysUntil: number; isPast: boolean }) {
  if (isPast) return <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">완료</span>;
  if (daysUntil === 0) return <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">오늘</span>;
  if (daysUntil < 0) return <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">완료</span>;
  if (daysUntil <= 7) return <span className="text-xs bg-orange-100 text-orange-600 font-bold px-2 py-0.5 rounded-full">D-{daysUntil}</span>;
  if (daysUntil <= 30) return <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">D-{daysUntil}</span>;
  return <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">D-{daysUntil}</span>;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [showPast, setShowPast] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  async function fetchEvents() {
    const res = await fetch("/api/calendar");
    const data = await res.json();
    setEvents(data);
    setLoading(false);
  }

  useEffect(() => { fetchEvents(); }, []);

  async function toggleFavorite(event: CalendarEvent) {
    setTogglingKey(event.key);
    const method = event.isFavorite ? "DELETE" : "POST";
    const res = await fetch("/api/calendar/favorites", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventKey: event.key }),
    });
    if (res.status === 401) {
      alert("즐겨찾기는 로그인 후 이용 가능합니다.");
      setTogglingKey(null);
      return;
    }
    setEvents((prev) =>
      prev.map((e) => (e.key === event.key ? { ...e, isFavorite: !e.isFavorite } : e))
    );
    setTogglingKey(null);
  }

  const filtered = events.filter((e) => {
    if (filter !== "ALL" && e.type !== filter) return false;
    if (!showPast && e.isPast) return false;
    return true;
  });

  const upcoming = filtered.filter((e) => !e.isPast).sort((a, b) => a.date.localeCompare(b.date));
  const past = filtered.filter((e) => e.isPast).sort((a, b) => b.date.localeCompare(a.date));

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-gray-400">불러오는 중...</p></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">경제 캘린더</h1>
        <p className="text-sm text-gray-400 mt-0.5">주요 경제 이벤트 일정과 D-Day를 확인하세요.</p>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === t
                ? "bg-blue-500 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            {FILTER_LABEL[t]}
          </button>
        ))}
        <label className="flex items-center gap-1.5 ml-auto text-sm text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
            className="rounded"
          />
          지난 이벤트 포함
        </label>
      </div>

      {/* 예정 이벤트 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          예정 이벤트 ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400">
            예정된 이벤트가 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((event) => (
              <EventCard key={event.key} event={event} onToggleFavorite={toggleFavorite} isToggling={togglingKey === event.key} />
            ))}
          </div>
        )}
      </div>

      {/* 지난 이벤트 */}
      {showPast && past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            지난 이벤트 ({past.length})
          </h2>
          <div className="space-y-2 opacity-60">
            {past.map((event) => (
              <EventCard key={event.key} event={event} onToggleFavorite={toggleFavorite} isToggling={togglingKey === event.key} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  onToggleFavorite,
  isToggling,
}: {
  event: CalendarEvent;
  onToggleFavorite: (e: CalendarEvent) => void;
  isToggling: boolean;
}) {
  const color = EVENT_TYPE_COLOR[event.type];
  const typeLabel = EVENT_TYPE_LABEL[event.type];

  const dateObj = new Date(event.date);
  const dateLabel = dateObj.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* 날짜 */}
          <div className="text-center flex-shrink-0 w-14">
            <p className="text-xs text-gray-400">
              {dateObj.toLocaleDateString("ko-KR", { month: "short" })}
            </p>
            <p className="text-xl font-bold text-gray-800 leading-tight">
              {dateObj.getDate()}
            </p>
          </div>

          {/* 이벤트 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: color + "20", color }}
              >
                {typeLabel}
              </span>
              {event.importance === "HIGH" && (
                <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">주요</span>
              )}
              <DDayBadge daysUntil={event.daysUntil} isPast={event.isPast} />
            </div>
            <p className="text-sm font-semibold text-gray-800">{event.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{dateLabel} · {event.description}</p>
          </div>
        </div>

        {/* 즐겨찾기 */}
        <button
          onClick={() => onToggleFavorite(event)}
          disabled={isToggling}
          className={`text-xl transition-colors flex-shrink-0 ${
            event.isFavorite ? "text-amber-400" : "text-gray-200 hover:text-amber-300"
          }`}
          title={event.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
        >
          ★
        </button>
      </div>
    </div>
  );
}
