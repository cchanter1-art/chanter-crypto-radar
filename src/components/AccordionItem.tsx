import { useState } from "react";
import { Plus } from "lucide-react";

interface AccordionItemProps {
  question: string;
  answer: string;
}

export default function AccordionItem({ question, answer }: AccordionItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{ borderBottom: "1px solid rgba(201,215,227,0.06)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left group"
        aria-expanded={open}
      >
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 400,
            fontSize: 14,
            color: "#c9d7e3",
            paddingRight: 16,
          }}
        >
          {question}
        </span>
        <Plus
          size={16}
          className="shrink-0 transition-transform duration-300"
          style={{
            color: "#4b5563",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
          }}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: open ? 200 : 0,
          opacity: open ? 1 : 0,
        }}
      >
        <p
          className="pb-5"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize: 14,
            color: "#4b5563",
            lineHeight: 1.6,
          }}
        >
          {answer}
        </p>
      </div>
    </div>
  );
}
