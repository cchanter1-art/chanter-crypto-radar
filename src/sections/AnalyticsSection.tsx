import { Suspense, lazy } from "react";
import PerformanceChart from "@/components/PerformanceChart";
import DonutChart from "@/components/DonutChart";
import MetricsList from "@/components/MetricsList";
import MarketNotes from "@/components/MarketNotes";
import PaperRiskEngine from "@/components/PaperRiskEngine";
import PaperSignalEngine from "@/components/PaperSignalEngine";
import { LazyRouteFallback } from "@/components/LazyRouteFallback";

const BacktestEngine = lazy(() => import("@/components/BacktestEngine"));
const FuturesPaperPanel = lazy(() => import("@/components/FuturesPaperPanel"));
const FuturesStrategyBacktestPanel = lazy(() => import("@/components/FuturesStrategyBacktestPanel"));
const ForwardTestSessionPanel = lazy(() => import("@/components/ForwardTestSessionPanel"));
const SignalQualityScorePanel = lazy(() => import("@/components/SignalQualityScorePanel"));
const MarketDataIntegrityPanel = lazy(() => import("@/components/MarketDataIntegrityPanel"));
const AutoIntelligenceCyclePanel = lazy(() => import("@/components/AutoIntelligenceCyclePanel"));
const CandidateReviewQueuePanel = lazy(() => import("@/components/CandidateReviewQueuePanel"));

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

      <Suspense fallback={<LazyRouteFallback />}>
        <BacktestEngine />
      </Suspense>

      <Suspense fallback={<LazyRouteFallback />}>
        <FuturesStrategyBacktestPanel />
      </Suspense>

      <Suspense fallback={<LazyRouteFallback />}>
        <ForwardTestSessionPanel />
      </Suspense>

      <Suspense fallback={<LazyRouteFallback />}>
        <SignalQualityScorePanel />
      </Suspense>

      <Suspense fallback={<LazyRouteFallback />}>
        <FuturesPaperPanel className="mt-8" />
      </Suspense>


      <Suspense fallback={<LazyRouteFallback />}>
        <MarketDataIntegrityPanel />
      </Suspense>
      <Suspense fallback={<LazyRouteFallback />}>
        <AutoIntelligenceCyclePanel />
      </Suspense>
          <Suspense fallback={null}>
            <CandidateReviewQueuePanel />
          </Suspense>

<MarketNotes className="mt-8" />
    </div>
  );
}
