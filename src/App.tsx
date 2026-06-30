import { useEffect, useRef } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AppProvider } from "@/context/AppProvider";
import CommandCenterDashboard from "@/components/CommandCenterDashboard";
import Navigation from "@/components/Navigation";
import ViewContainer from "@/components/ViewContainer";
import WatchlistSection from "@/sections/WatchlistSection";
import PortfolioSection from "@/sections/PortfolioSection";
import AnalyticsSection from "@/sections/AnalyticsSection";
import SettingsSection from "@/sections/SettingsSection";
import HelpSection from "@/sections/HelpSection";
import type { TranceTunnel } from "@/lib/TranceTunnel";

function AppContent() {
  const tunnelRef = useRef<TranceTunnel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    let isActive = true;

    if (containerRef.current && !tunnelRef.current) {
      const container = containerRef.current;

      void import("@/lib/TranceTunnel")
        .then(({ TranceTunnel: Tunnel }) => {
          if (!isActive || tunnelRef.current) return;

          try {
            tunnelRef.current = new Tunnel(container, {
              rings: 5,
              tubes: 14,
              speed: 1.0,
              dieSpeed: 0.02,
            });
          } catch {
            tunnelRef.current = null;
          }
        })
        .catch(() => {
          tunnelRef.current = null;
        });
    }

    return () => {
      isActive = false;
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
                <CommandCenterDashboard />
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
