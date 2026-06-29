import { useEffect, useRef } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { TranceTunnel } from "@/lib/TranceTunnel";
import Navigation from "@/components/Navigation";
import ViewContainer from "@/components/ViewContainer";
import HeroSection from "@/sections/HeroSection";
import WatchlistSection from "@/sections/WatchlistSection";
import PortfolioSection from "@/sections/PortfolioSection";
import AnalyticsSection from "@/sections/AnalyticsSection";
import SettingsSection from "@/sections/SettingsSection";
import HelpSection from "@/sections/HelpSection";

function AppContent() {
  const tunnelRef = useRef<TranceTunnel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (containerRef.current && !tunnelRef.current) {
      tunnelRef.current = new TranceTunnel(containerRef.current, {
        rings: 5,
        tubes: 14,
        speed: 1.0,
        dieSpeed: 0.02,
      });
    }

    return () => {
      if (tunnelRef.current) {
        tunnelRef.current.destroy();
        tunnelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "#050505" }}>
      {/* WebGL Tunnel Container */}
      <div
        ref={containerRef}
        className="fixed inset-0"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      />

      {/* Navigation */}
      <Navigation />

      {/* Content */}
      <div className="relative" style={{ zIndex: 1 }}>
        <Routes>
          <Route
            path="/"
            element={
              <ViewContainer>
                <HeroSection />
              </ViewContainer>
            }
          />
          <Route
            path="/watchlist"
            element={
              <ViewContainer>
                <WatchlistSection />
              </ViewContainer>
            }
          />
          <Route
            path="/portfolio"
            element={
              <ViewContainer>
                <PortfolioSection />
              </ViewContainer>
            }
          />
          <Route
            path="/analytics"
            element={
              <ViewContainer>
                <AnalyticsSection />
              </ViewContainer>
            }
          />
          <Route
            path="/settings"
            element={
              <ViewContainer>
                <SettingsSection />
              </ViewContainer>
            }
          />
          <Route
            path="/help"
            element={
              <ViewContainer>
                <HelpSection />
              </ViewContainer>
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
