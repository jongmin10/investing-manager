import type { LynchResult } from "@/lib/lynch-types";

interface Props {
  drill: LynchResult["twoMinuteDrill"];
}

const DRILL_FIELDS: {
  key: keyof LynchResult["twoMinuteDrill"];
  label: string;
  icon: string;
}[] = [
  { key: "whatItSells",      label: "무엇을 파는가",   icon: "🏷️" },
  { key: "whosBuying",       label: "누가 사는가",     icon: "👥" },
  { key: "howItMakesMoney",  label: "어떻게 버는가",   icon: "💰" },
  { key: "biggestRisk",      label: "가장 큰 위험은",  icon: "⚠️" },
];

function isUnavailable(text: string) {
  return text.includes("확인 불가") || text.trim() === "";
}

export default function LynchTwoMinuteDrill({ drill }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <h3 className="text-base font-bold text-gray-900 mb-1">
        2분 드릴 (Two-Minute Drill)
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        이 종목을 2분 안에 설명할 수 없으면 매수하지 않는다 — 피터 린치
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DRILL_FIELDS.map(({ key, label, icon }) => {
          const text = drill[key];
          const unavailable = isUnavailable(text);
          return (
            <div
              key={key}
              className={`rounded-xl p-4 ${
                unavailable
                  ? "bg-gray-50 border border-dashed border-gray-200"
                  : "bg-blue-50 border border-blue-100"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base leading-none" role="img" aria-hidden="true">
                  {icon}
                </span>
                <span
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    unavailable ? "text-gray-400" : "text-blue-700"
                  }`}
                >
                  {label}
                </span>
              </div>
              <p
                className={`text-sm leading-relaxed ${
                  unavailable ? "text-gray-400 italic" : "text-gray-700"
                }`}
              >
                {text || "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
