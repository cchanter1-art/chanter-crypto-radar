import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer
      className="w-full px-6 lg:px-12 py-8"
      style={{ borderTop: "1px solid rgba(201,215,227,0.06)" }}
    >
      <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-4" style={{ maxWidth: 1280 }}>
        <div className="flex items-center gap-2">
          <span
            className="font-heading tracking-[0.08em] text-xs uppercase"
            style={{ color: "#4b5563", fontWeight: 400 }}
          >
            CHANTER
          </span>
          <span className="text-xs" style={{ color: "#4b5563", fontFamily: "'DM Sans', sans-serif", fontWeight: 300 }}>
            2026
          </span>
        </div>

        <p
          className="text-xs"
          style={{
            color: "#4b5563",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
          }}
        >
          Crypto intelligence for everyone.
        </p>

        <div className="flex items-center gap-6">
          <Link
            to="/settings"
            className="text-xs transition-colors duration-250 hover:text-[#c9d7e3]"
            style={{
              color: "#4b5563",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 400,
            }}
          >
            Privacy
          </Link>
          <Link
            to="/settings"
            className="text-xs transition-colors duration-250 hover:text-[#c9d7e3]"
            style={{
              color: "#4b5563",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 400,
            }}
          >
            Terms
          </Link>
          <Link
            to="/help"
            className="text-xs transition-colors duration-250 hover:text-[#c9d7e3]"
            style={{
              color: "#4b5563",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 400,
            }}
          >
            Docs
          </Link>
        </div>
      </div>
    </footer>
  );
}
