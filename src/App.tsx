import { Suspense, lazy, useEffect, useRef } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import { AppProvider } from "@/context/AppProvider";
import Navigation from "@/components/Navigation";
import ViewContainer from "@/components/ViewContainer";
import { LazyRouteFallback } from "@/components/LazyRouteFallback";
import type { TranceTunnel } from "@/lib/TranceTunnel";

const CommandCenterDashboard = lazy(() => import("@/components/CommandCenterDashboard"));
const WatchlistSection = lazy(() => import("@/sections/WatchlistSection"));
const PortfolioSection = lazy(() => import("@/sections/PortfolioSection"));
const AnalyticsSection = lazy(() => import("@/sections/AnalyticsSection"));
const SettingsSection = lazy(() => import("@/sections/SettingsSection"));
const HelpSection = lazy(() => import("@/sections/HelpSection"));

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
                <Suspense fallback={<LazyRouteFallback />}>
                  <CommandCenterDashboard />
                </Suspense>
              </ViewContainer>
            }
          />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route
            path="/watchlist"
            element={
              <ViewContainer>
                <Suspense fallback={<LazyRouteFallback />}>
                  <WatchlistSection />
                </Suspense>
              </ViewContainer>
            }
          />
          <Route
            path="/portfolio"
            element={
              <ViewContainer>
                <Suspense fallback={<LazyRouteFallback />}>
                  <PortfolioSection />
                </Suspense>
              </ViewContainer>
            }
          />
          <Route
            path="/analytics"
            element={
              <ViewContainer>
                <Suspense fallback={<LazyRouteFallback />}>
                  <AnalyticsSection />
                </Suspense>
              </ViewContainer>
            }
          />
          <Route
            path="/settings"
            element={
              <ViewContainer>
                <Suspense fallback={<LazyRouteFallback />}>
                  <SettingsSection />
                </Suspense>
              </ViewContainer>
            }
          />
          <Route
            path="/help"
            element={
              <ViewContainer>
                <Suspense fallback={<LazyRouteFallback />}>
                  <HelpSection />
                </Suspense>
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
