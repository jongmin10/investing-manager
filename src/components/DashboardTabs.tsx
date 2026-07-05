"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import IndicatorPanel from "@/components/IndicatorPanel";
import DataCenterUS from "@/components/datacenter/DataCenterUS";
import DataCenterGlobal from "@/components/datacenter/DataCenterGlobal";
import type { IndicatorType } from "@/lib/indicators";
import type { MarketSummary } from "@/lib/analysis";
import type {
  CapexPoint, PowerPoint, DCCountPoint, SemiconPoint,
  DCSummary, CountryRecord,
} from "@/lib/datacenter";

interface IndicatorData {
  type: IndicatorType;
  value: number;
  recordedAt: string;
  change: number;
  changePercent: number;
}

interface DCData {
  summary: DCSummary;
  capexSeries: CapexPoint[];
  powerSeries: PowerPoint[];
  dcCountSeries: DCCountPoint[];
  countries: CountryRecord[];
  semiconSeries: SemiconPoint[];
}

interface Props {
  indicators: IndicatorData[];
  summary: MarketSummary;
  lastUpdated: string;
  dcData: DCData;
}

type MainTab = "indicators" | "datacenter";
type DCSubTab = "us" | "global";

export default function DashboardTabs({ indicators, summary, lastUpdated, dcData }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const mainTab = (searchParams.get("tab") ?? "indicators") as MainTab;
  const dcSub = (searchParams.get("sub") ?? "us") as DCSubTab;

  function setTab(tab: MainTab, sub?: DCSubTab) {
    const p = new URLSearchParams();
    if (tab !== "indicators") p.set("tab", tab);
    if (sub && sub !== "us") p.set("sub", sub);
    startTransition(() => {
      router.push(`/?${p.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="space-y-4">
      {/* 메인 탭 바 */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <TabButton
          active={mainTab === "indicators"}
          onClick={() => setTab("indicators")}
        >
          📊 경제지표
        </TabButton>
        <TabButton
          active={mainTab === "datacenter"}
          onClick={() => setTab("datacenter", dcSub)}
        >
          🏗️ 데이터센터
        </TabButton>
      </div>

      {/* 경제지표 탭 */}
      {mainTab === "indicators" && (
        <IndicatorPanel
          indicators={indicators}
          summary={summary}
          lastUpdated={lastUpdated}
        />
      )}

      {/* 데이터센터 탭 */}
      {mainTab === "datacenter" && (
        <div className="space-y-4">
          {/* 서브탭 */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            <TabButton
              active={dcSub === "us"}
              onClick={() => setTab("datacenter", "us")}
              small
            >
              🇺🇸 미국
            </TabButton>
            <TabButton
              active={dcSub === "global"}
              onClick={() => setTab("datacenter", "global")}
              small
            >
              🌍 글로벌
            </TabButton>
          </div>

          {dcSub === "us" && (
            <DataCenterUS
              summary={dcData.summary}
              capexSeries={dcData.capexSeries}
              powerSeries={dcData.powerSeries}
              dcCountSeries={dcData.dcCountSeries}
              semiconSeries={dcData.semiconSeries}
            />
          )}
          {dcSub === "global" && (
            <DataCenterGlobal countries={dcData.countries} />
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
  small,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-medium transition-all ${
        active
          ? "bg-white text-gray-900 shadow-sm"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
