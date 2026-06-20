export const MOODS = [
  { key: "anxious",    emoji: "😰", label: "불안",  color: "bg-red-50 text-red-600 border-red-200" },
  { key: "neutral",    emoji: "😐", label: "중립",  color: "bg-gray-50 text-gray-600 border-gray-200" },
  { key: "optimistic", emoji: "😊", label: "낙관",  color: "bg-blue-50 text-blue-600 border-blue-200" },
  { key: "confident",  emoji: "💪", label: "확신",  color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
] as const;

export const DECISION_TYPES = [
  { key: "buy",       label: "매수",     color: "bg-emerald-100 text-emerald-700" },
  { key: "sell",      label: "매도",     color: "bg-red-100 text-red-700" },
  { key: "rebalance", label: "리밸런싱", color: "bg-blue-100 text-blue-700" },
  { key: "hold",      label: "관망",     color: "bg-gray-100 text-gray-600" },
  { key: "analysis",  label: "분석",     color: "bg-purple-100 text-purple-700" },
] as const;

export function getMood(key: string | null | undefined) {
  return MOODS.find((m) => m.key === key) ?? null;
}

export function getDecisionType(key: string | null | undefined) {
  return DECISION_TYPES.find((d) => d.key === key) ?? null;
}
