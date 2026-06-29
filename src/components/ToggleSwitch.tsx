interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}

export default function ToggleSwitch({ checked, onChange, disabled = false, label, description }: ToggleSwitchProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 400,
            fontSize: 14,
            color: "#c9d7e3",
          }}
        >
          {label}
        </p>
        {description && (
          <p
            className="mt-0.5"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: 12,
              color: "#4b5563",
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className="relative shrink-0 rounded-full transition-colors duration-250"
        style={{
          width: 32,
          height: 18,
          backgroundColor: checked ? "#cc9258" : "#4b5563",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          className="absolute top-0.5 rounded-full bg-white transition-transform duration-250"
          style={{
            width: 14,
            height: 14,
            left: 2,
            transform: checked ? "translateX(14px)" : "translateX(0)",
          }}
        />
      </button>
    </div>
  );
}
