import type { LynchFlag } from "@/lib/lynch-types";

interface Props {
  greenFlags: LynchFlag[];
  redFlags: LynchFlag[];
}

function FlagIcon({ result }: { result: LynchFlag["result"] }) {
  if (result === "PASS") {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex-shrink-0"
        aria-label="긍정 신호"
      >
        ✓
      </span>
    );
  }
  if (result === "FAIL") {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs font-bold flex-shrink-0"
        aria-label="부정 신호"
      >
        ✗
      </span>
    );
  }
  if (result === "CAUTION") {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-50 text-amber-600 text-xs font-bold flex-shrink-0 ring-1 ring-amber-300"
        aria-label="주의 신호 (중간 구간)"
        title="주의 — 린치 기준 중간 구간"
      >
        ≈
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-[9px] font-bold flex-shrink-0"
      aria-label="확인 불가"
    >
      N/A
    </span>
  );
}

function FlagItem({ flag }: { flag: LynchFlag }) {
  return (
    <div
      className={`flex items-start gap-2.5 p-3 rounded-xl border ${
        flag.result === "PASS"
          ? "bg-emerald-50 border-emerald-100"
          : flag.result === "FAIL"
          ? "bg-red-50 border-red-100"
          : flag.result === "CAUTION"
          ? "bg-amber-50 border-amber-200"
          : "bg-gray-50 border-gray-200"
      }`}
    >
      <FlagIcon result={flag.result} />
      <div className="min-w-0">
        <p
          className={`text-sm font-semibold ${
            flag.result === "PASS"
              ? "text-emerald-800"
              : flag.result === "FAIL"
              ? "text-red-800"
              : flag.result === "CAUTION"
              ? "text-amber-800"
              : "text-gray-500"
          }`}
        >
          {flag.label}
        </p>
        <p
          className={`text-xs mt-0.5 leading-relaxed ${
            flag.result === "NA" ? "italic text-gray-400" : "text-gray-600"
          }`}
        >
          {flag.comment}
        </p>
      </div>
    </div>
  );
}

export default function LynchFlags({ greenFlags, redFlags }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <h3 className="text-base font-bold text-gray-900 mb-4">
        Green Flags / Red Flags
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Green Flags */}
        <div>
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
            <span aria-hidden="true">🟢</span> 긍정 신호
          </p>
          <div className="space-y-2">
            {greenFlags.map((flag, i) => (
              <FlagItem key={i} flag={flag} />
            ))}
          </div>
        </div>

        {/* Red Flags */}
        <div>
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
            <span aria-hidden="true">🔴</span> 부정 신호
          </p>
          <div className="space-y-2">
            {redFlags.map((flag, i) => (
              <FlagItem key={i} flag={flag} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
