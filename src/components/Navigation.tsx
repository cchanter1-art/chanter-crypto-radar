import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Menu, X, LineChart, Eye, Wallet, BarChart3, Settings, HelpCircle } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LineChart },
  { path: "/watchlist", label: "Watchlist", icon: Eye },
  { path: "/portfolio", label: "Portfolio", icon: Wallet },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/settings", label: "Settings", icon: Settings },
  { path: "/help", label: "Help", icon: HelpCircle },
];

export default function Navigation() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] glass-nav" style={{ borderBottom: "1px solid rgba(201,215,227,0.08)" }}>
      <div className="mx-auto flex items-center justify-between px-6 lg:px-10" style={{ height: 64, maxWidth: 1280 }}>
        {/* Logo */}
        <Link to="/" className="flex items-center gap-1.5 shrink-0">
          <span
            className="font-heading tracking-[0.12em] text-sm uppercase"
            style={{ color: "#c9d7e3", fontWeight: 400 }}
          >
            CHANTER
          </span>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#cc9258" }} />
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center" style={{ gap: 40 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${isActive ? "nav-link-active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Status Pill + Mobile Menu */}
        <div className="flex items-center gap-4">
          <span className="status-pill hidden sm:inline-flex items-center">
            <span className="inline-block h-1.5 w-1.5 rounded-full mr-2" style={{ backgroundColor: "#22c55e" }} />
            Market Open
          </span>

          <button
            className="md:hidden p-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X size={20} style={{ color: "#c9d7e3" }} />
            ) : (
              <Menu size={20} style={{ color: "#4b5563" }} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          className="md:hidden px-6 pb-4 animate-fade-in"
          style={{ borderTop: "1px solid rgba(201,215,227,0.08)" }}
        >
          <div className="flex flex-col pt-3" style={{ gap: 4 }}>
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${
                    isActive ? "nav-link-active" : "nav-link"
                  }`}
                  style={isActive ? { backgroundColor: "rgba(204,146,88,0.08)" } : {}}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <span className="status-pill inline-flex items-center self-start mt-2 sm:hidden">
              <span className="inline-block h-1.5 w-1.5 rounded-full mr-2" style={{ backgroundColor: "#22c55e" }} />
              Market Open
            </span>
          </div>
        </div>
      )}
    </nav>
  );
}
