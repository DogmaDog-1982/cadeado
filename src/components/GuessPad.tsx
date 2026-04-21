import { useState } from "react";

interface Props {
  disabled?: boolean;
  onGuess: (n: number) => void;
}

export function GuessPad({ disabled, onGuess }: Props) {
  const [pending, setPending] = useState<number | null>(null);

  const handle = async (n: number) => {
    if (disabled || pending !== null) return;
    setPending(n);
    try {
      await onGuess(n);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="grid grid-cols-5 gap-2 w-full max-w-md mx-auto">
      {Array.from({ length: 10 }, (_, n) => {
        const isPending = pending === n;
        return (
          <button
            key={n}
            disabled={disabled || pending !== null}
            onClick={() => handle(n)}
            className={`aspect-square text-2xl font-mono-arcade font-bold border-2 border-foreground rounded-xl active:translate-x-[2px] active:translate-y-[2px] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              disabled
                ? "bg-card text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105"
            } ${isPending ? "animate-pulse" : ""}`}
            style={{ boxShadow: "var(--shadow-pop-sm)" }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
