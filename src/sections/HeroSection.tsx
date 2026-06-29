import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative z-[1] flex items-center min-h-screen w-full">
      <div
        className="relative z-[2] px-6 lg:px-12 w-full"
        style={{ maxWidth: 1280, margin: "0 auto" }}
      >
        <div style={{ paddingLeft: "5vw", maxWidth: 520 }}>
          <h1
            className="font-heading lowercase"
            style={{
              fontSize: "clamp(32px, 4vw, 64px)",
              fontWeight: 400,
              color: "#c9d7e3",
              letterSpacing: "-0.02em",
              lineHeight: 1.0,
              textShadow: "0 2px 30px rgba(0,0,0,0.6)",
            }}
          >
            crypto intelligence, simplified
          </h1>

          <p
            className="mt-6"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: 16,
              color: "#4b5563",
              maxWidth: 420,
              lineHeight: 1.6,
            }}
          >
            Track markets. Build your watchlist. Simulate trades. All in one place.
          </p>

          <div className="mt-8">
            <Link
              to="/watchlist"
              className="text-link-accent inline-flex items-center gap-2"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 400,
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#cc9258",
              }}
            >
              <span>Explore Markets</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
