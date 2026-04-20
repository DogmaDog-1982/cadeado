import { useRef } from "react";

interface Props {
  value: number[];
  onChange: (v: number[]) => void;
}

export function SecretInput({ value, onChange }: Props) {
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const setDigit = (i: number, d: string) => {
    if (!/^\d?$/.test(d)) return;
    const next = [...value];
    next[i] = d === "" ? -1 : parseInt(d);
    onChange(next);
    if (d !== "" && i < 3) refs[i + 1].current?.focus();
  };

  return (
    <div className="flex gap-3 justify-center">
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={refs[i]}
          inputMode="numeric"
          maxLength={1}
          value={value[i] >= 0 ? String(value[i]) : ""}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !e.currentTarget.value && i > 0) refs[i - 1].current?.focus();
          }}
          className="w-14 h-16 text-center text-3xl font-mono-arcade font-bold bg-card border-2 border-foreground rounded-xl focus:outline-none focus:bg-accent transition-colors"
          style={{ boxShadow: "var(--shadow-pop-sm)" }}
        />
      ))}
    </div>
  );
}
