import type { LynchResult } from "@/lib/lynch-types";

interface Props {
  verdict: LynchResult["verdict"];
}

const ACTION_META = {
  BUY:  { label: "매수",  bg: "bg-emerald-500", text: "text-emerald-50", badge: "bg-emerald-400 text-white" },
  HOLD: { label: "홀드",  bg: "bg-blue-500",    text: "text-blue-50",    badge: "bg-blue-400 text-white"    },
  SELL: { label: "매도",  bg: "bg-red-500",     text: "text-red-50",     badge: "bg-red-400 text-white"     },
};

export default function LynchVerdict({ verdict }: Props) {
  const meta = ACTION_META[verdict.action];

  return (
    <div
      className={`rounded-2xl p-5 shadow-sm ${meta.bg}`}
      role="region"
      aria-label="피터 린치 분석 결론"
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          className={`px-4 py-1.5 rounded-full text-sm font-bold ${meta.badge}`}
          aria-label={`행동 제안: ${meta.label}`}
        >
          {meta.label}
        </span>
        <h3 className={`text-base font-bold ${meta.text}`}>종합 결론</h3>
      </div>

      <p className={`text-sm leading-relaxed ${meta.text}`}>{verdict.rationale}</p>

      {/* 인라인 AI 면책 주석 */}
      <p
        className={`text-xs mt-3 opacity-70 ${meta.text}`}
        role="note"
      >
        * AI로 적용한 참고자료, 실제 투자결정에 직접 사용 금지
      </p>
    </div>
  );
}
