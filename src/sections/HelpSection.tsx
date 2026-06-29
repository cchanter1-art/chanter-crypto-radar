import AccordionItem from "@/components/AccordionItem";
import { Mail } from "lucide-react";

const FAQS = [
  {
    question: "What is CHANTER?",
    answer:
      "CHANTER Crypto Radar is a crypto intelligence dashboard that helps you track market prices, manage a personal watchlist, and simulate trades with a paper portfolio. No real money, no wallet connection — just pure intelligence.",
  },
  {
    question: "How does the watchlist work?",
    answer:
      "Add any supported cryptocurrency to your watchlist to track its live price and 24-hour change. You can add or remove coins at any time. Your watchlist is saved locally in your browser.",
  },
  {
    question: "What is paper trading?",
    answer:
      "Paper trading lets you simulate buying and selling cryptocurrencies without using real money. Record trades at any price, track your positions, and see how your portfolio would perform — risk-free.",
  },
  {
    question: "How is P/L calculated?",
    answer:
      "Unrealized P/L is calculated as (current value - total invested) for each position. The percentage is P/L divided by total invested. All values update based on the mock market prices shown in the watchlist.",
  },
  {
    question: "Can I connect a real wallet?",
    answer:
      "Not in this version. CHANTER is a pure intelligence and simulation tool. Wallet integration and live trading may be added in future releases.",
  },
  {
    question: "Is my data saved?",
    answer:
      "Yes — all your data (watchlist, trades, settings) is stored locally in your browser using LocalStorage. It never leaves your device. You can export it anytime from Settings.",
  },
];

export default function HelpSection() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div className="mb-8">
        <h2 className="section-title mb-2">Help Center</h2>
        <p className="section-subtitle">Frequently asked questions and support</p>
      </div>

      <div
        className="card-surface rounded-xl p-5 lg:p-6 mb-10"
        style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      >
        {FAQS.map((faq, i) => (
          <AccordionItem key={i} question={faq.question} answer={faq.answer} />
        ))}
      </div>

      <div className="flex items-center gap-3 px-1">
        <Mail size={16} style={{ color: "#cc9258" }} />
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 400,
            fontSize: 14,
            color: "#c9d7e3",
          }}
        >
          Need more help?{" "}
          <a
            href="mailto:support@chanter.io"
            className="text-link-accent"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 400,
              fontSize: 14,
              color: "#cc9258",
            }}
          >
            support@chanter.io
          </a>
        </span>
      </div>
    </div>
  );
}
