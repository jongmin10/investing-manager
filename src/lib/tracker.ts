export type AssetClass = "GUARANTEED" | "BOND" | "MIXED" | "EQUITY";

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  GUARANTEED: "원리금보장",
  BOND: "채권형",
  MIXED: "혼합형",
  EQUITY: "주식형",
};

export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  GUARANTEED: "#3b82f6",
  BOND: "#10b981",
  MIXED: "#f59e0b",
  EQUITY: "#ef4444",
};

export interface IndicatorSnapshot {
  kospi: number;
  bondRate3Y: number;
  bokRate: number;
}

export function calculateReturn(
  assetClass: AssetClass,
  purchaseDate: Date,
  atPurchase: IndicatorSnapshot,
  now: IndicatorSnapshot
): number {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const yearsElapsed = (Date.now() - purchaseDate.getTime()) / MS_PER_YEAR;
  if (yearsElapsed <= 0) return 0;

  const equityReturn =
    atPurchase.kospi > 0
      ? ((now.kospi - atPurchase.kospi) / atPurchase.kospi) * 100
      : 0;

  // Modified duration ~3 for 3Y bond + accrued coupon approximation
  const DURATION = 3;
  const rateChangePct = now.bondRate3Y - atPurchase.bondRate3Y;
  const bondPriceReturn = -rateChangePct * DURATION;
  const bondCouponReturn = atPurchase.bondRate3Y * yearsElapsed;
  const bondReturn = bondPriceReturn + bondCouponReturn;

  switch (assetClass) {
    case "EQUITY":
      return equityReturn;
    case "BOND":
      return bondReturn;
    case "MIXED":
      return 0.5 * equityReturn + 0.5 * bondReturn;
    case "GUARANTEED":
      return atPurchase.bokRate * yearsElapsed;
    default:
      return 0;
  }
}

export function weightedPortfolioReturn(
  holdings: { weight: number; estimatedReturn: number }[]
): number {
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = holdings.reduce((s, h) => s + h.weight * h.estimatedReturn, 0);
  return weightedSum / totalWeight;
}
