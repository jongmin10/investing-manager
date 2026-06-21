"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const AUTO_REFRESH_MS = 15 * 60 * 1000; // 15분

function useTimeAgo(isoStr: string) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function update() {
      const diffMs = Date.now() - new Date(isoStr).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) setLabel("방금");
      else if (diffSec < 3600) setLabel(`${Math.floor(diffSec / 60)}분 전`);
      else setLabel(`${Math.floor(diffSec / 3600)}시간 전`);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [isoStr]);

  return label;
}

interface Props {
  lastUpdated: string; // ISO string
}

export default function RealtimeRefresh({ lastUpdated }: Props) {
  const router = useRouter();
  const timeAgo = useTimeAgo(lastUpdated);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [detail, setDetail] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    setDetail("");
    try {
      const res = await fetch("/api/collect", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setStatus("ok");
        setDetail(`${data.updated.length}개 지표 업데이트`);
        router.refresh();
      } else {
        setStatus("error");
        setDetail(data.error ?? "일부 지표 수집 실패");
        if (data.updated?.length > 0) router.refresh();
      }
    } catch {
      setStatus("error");
      setDetail("네트워크 오류");
    }

    setTimeout(() => setStatus("idle"), 4000);
  }, [router]);

  // 15분 자동 갱신
  useEffect(() => {
    const id = setInterval(refresh, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const isLoading = status === "loading";

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-2">
        {/* 마지막 업데이트 시각 */}
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {timeAgo ? `업데이트: ${timeAgo}` : ""}
        </span>

        {/* 새로고침 버튼 */}
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-full whitespace-nowrap shrink-0
            hover:border-blue-300 hover:text-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="실시간 시세 새로고침"
        >
          <span className={isLoading ? "animate-spin inline-block" : ""}>↻</span>
          {isLoading ? "업데이트 중..." : "새로고침"}
        </button>
      </div>

      {/* 결과 메시지 */}
      {status !== "idle" && !isLoading && (
        <p
          className={`text-[11px] ${
            status === "ok" ? "text-emerald-500" : "text-red-400"
          }`}
        >
          {status === "ok" ? "✓" : "⚠"} {detail}
        </p>
      )}
    </div>
  );
}
