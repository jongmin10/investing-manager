"use client";

import IndicatorCard from "@/components/IndicatorCard";
import MarketSummaryCard from "@/components/MarketSummary";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import { type IndicatorType } from "@/lib/indicators";
import { type MarketSummary } from "@/lib/analysis";

interface IndicatorData {
  type: IndicatorType;
  value: number;
  recordedAt: string;
  change: number;
  changePercent: number;
}

interface Props {
  indicators: IndicatorData[];
  summary: MarketSummary;
  lastUpdated: string;
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-[11px] text-gray-400 font-medium px-1">{label}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

export default function IndicatorPanel({ indicators, summary, lastUpdated }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RealtimeRefresh lastUpdated={lastUpdated} />
      </div>

      <MarketSummaryCard summary={summary} />

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">금리</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["BOK_BASE_RATE", "GOV_BOND_3Y", "GOV_BOND_10Y"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
          <Divider label="미국" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["FED_RATE", "US_TREASURY_2Y", "US_TREASURY_10Y"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">주식시장</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["KOSPI", "KOSDAQ"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
          <Divider label="미국" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["SP500", "NASDAQ100", "SOX"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">물가</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["CPI", "PPI"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
          <Divider label="미국" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["US_CPI", "US_PPI"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">경기</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["CLI", "UNEMPLOYMENT"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
          <Divider label="미국" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["US_CLI", "US_UNEMPLOYMENT"].map((type) => {
              const d = indicators.find((i) => i.type === type);
              return d ? <IndicatorCard key={type} data={d} /> : null;
            })}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">외환 &amp; 변동성</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {["KRW_USD", "VIX", "FEAR_GREED"].map((type) => {
            const d = indicators.find((i) => i.type === type);
            return d ? <IndicatorCard key={type} data={d} /> : null;
          })}
        </div>
      </section>
    </div>
  );
}
