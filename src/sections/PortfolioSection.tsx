import { useState } from "react";
import { Plus, TrendingUp, TrendingDown, DollarSign, PieChart } from "lucide-react";
import { useAppState, usePortfolio } from "@/context/AppContext";
import StatCard from "@/components/StatCard";
import PortfolioTable from "@/components/PortfolioTable";
import AddTradeModal from "@/components/AddTradeModal";
import MarketPriceStatus from "@/components/MarketPriceStatus";
import PaperRiskEngine from "@/components/PaperRiskEngine";
import PaperSignalEngine from "@/components/PaperSignalEngine";
import TradeHistoryTable from "@/components/TradeHistoryTable";
import type { PaperTrade } from "@/types";

export default function PortfolioSection() {
  const { state, dispatch } = useAppState();
  const { positions, totalInvested, totalValue, totalPL, totalPLPercent } = usePortfolio();
  const [showModal, setShowModal] = useState(false);

  const isPositive = totalPL >= 0;

  const handleAddTrade = (trade: PaperTrade) => {
    dispatch({ type: "ADD_TRADE", payload: trade });
  };

  const handleDeleteTrade = (id: string) => {
    dispatch({ type: "DELETE_TRADE", payload: id });
  };

  const handleClearTrades = () => {
    if (window.confirm("Clear all browser-local paper trades?")) {
      dispatch({ type: "CLEAR_TRADES" });
    }
  };

  const handleRestoreTrades = () => {
    if (
      state.trades.length === 0 ||
      window.confirm("Replace the current paper trade history with the sample trades?")
    ) {
      dispatch({ type: "RESTORE_SAMPLE_TRADES" });
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="section-title mb-2">Paper Portfolio</h2>
        <p className="section-subtitle">
          Simulate trades and track performance without real capital
        </p>
        <p className="mt-2 text-xs" style={{ color: "#4b5563" }}>
          Paper trades only. No real orders are placed.
        </p>
      </div>

      <MarketPriceStatus />

      {/* Summary Bar */}
      <div className="flex flex-col sm:flex-row gap-4 lg:gap-6 mb-8">
        <StatCard
          label="Total Invested"
          value={totalInvested}
          prefix="$"
          decimals={2}
          icon={<DollarSign size={14} />}
        />
        <StatCard
          label="Current Value"
          value={totalValue}
          prefix="$"
          decimals={2}
          icon={<PieChart size={14} />}
        />
        <StatCard
          label="Unrealized P/L"
          value={totalPL}
          prefix={totalPL >= 0 ? "+$" : "-$"}
          decimals={2}
          color={isPositive ? "#22c55e" : "#ef4444"}
          icon={isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        />
        <StatCard
          label="% Gain/Loss"
          value={Math.abs(totalPLPercent)}
          suffix="%"
          decimals={2}
          color={isPositive ? "#22c55e" : "#ef4444"}
          icon={isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        />
      </div>

      {/* Positions Table */}
      <PortfolioTable positions={positions} />

      <PaperRiskEngine className="mt-8" />

      <PaperSignalEngine className="mt-8" />

      <button
        onClick={() => setShowModal(true)}
        className="btn-accent mt-8 flex items-center gap-2"
      >
        <Plus size={14} />
        Add Trade
      </button>

      <TradeHistoryTable
        trades={state.trades}
        onDelete={handleDeleteTrade}
        onClear={handleClearTrades}
        onRestore={handleRestoreTrades}
      />

      {showModal && (
        <AddTradeModal
          onClose={() => setShowModal(false)}
          onAdd={handleAddTrade}
        />
      )}
    </div>
  );
}
