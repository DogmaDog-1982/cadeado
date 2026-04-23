import { forwardRef } from "react";
import type { Guess } from "@/lib/game-utils";

export const GuessHistory = forwardRef<HTMLDivElement, { guesses: Guess[]; title: string }>(function GuessHistory(
  { guesses, title },
  ref,
) {
  if (guesses.length === 0) {
    return (
      <div ref={ref} className="text-center text-sm text-muted-foreground py-2">Nenhum palpite ainda</div>
    );
  }
  return (
    <div ref={ref}>
      <h3 className="text-xs uppercase tracking-wider font-bold mb-2 text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {guesses.map((g, i) => {
          const icon = g.hint === "correct" ? "✓" : g.hint === "higher" ? "↑" : "↓";
          const cls =
            g.hint === "correct"
              ? "bg-success text-success-foreground"
              : "bg-card text-foreground";
          return (
            <span
              key={i}
              className={`px-2 py-1 rounded-md border-2 border-foreground font-mono-arcade text-xs font-bold ${cls}`}
            >
              p{g.position + 1}: {g.guess} {icon}
            </span>
          );
        })}
      </div>
    </div>
  );
});
