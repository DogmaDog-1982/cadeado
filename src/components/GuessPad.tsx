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
      {Array.from({ length: 10 }, (_, n) => (
        <button
          key={n}
          disabled={disabled || pending !== null}
          onClick={() => handle(n)}
          className="aspect-square text-2xl font-mono-arcade font-bold bg-card border-2 border-foreground rounded-xl active:translate-x-[2px] active:translate-y-[2px] transition-transform disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent"
          style={{ boxShadow: "var(--shadow-pop-sm)" }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
