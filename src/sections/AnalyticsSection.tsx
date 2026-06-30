import PerformanceChart from "@/components/PerformanceChart";
import DonutChart from "@/components/DonutChart";
import MetricsList from "@/components/MetricsList";
import MarketNotes from "@/components/MarketNotes";
import PaperRiskEngine from "@/components/PaperRiskEngine";
import PaperSignalEngine from "@/components/PaperSignalEngine";
import BacktestEngine from "@/components/BacktestEngine";
import FuturesPaperPanel from "@/components/FuturesPaperPanel";
import FuturesStrategyBacktestPanel from "@/components/FuturesStrategyBacktestPanel";

export default function AnalyticsSection() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="section-title mb-2">Analytics</h2>
        <p className="section-subtitle">Deep insights into your portfolio performance</p>
      </div>

      <PerformanceChart />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <DonutChart />
        <MetricsList />
      </div>

      <PaperRiskEngine className="mt-8" />

      <PaperSignalEngine className="mt-8" />

      <BacktestEngine />

      <FuturesStrategyBacktestPanel />

      <FuturesPaperPanel className="mt-8" />

      <MarketNotes className="mt-8" />
    </div>
  );
}
