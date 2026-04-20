import { motion } from "framer-motion";

interface Props {
  label: string;
  positionsRevealed: number; // 0-4: positions player has already cracked
  highlight?: boolean;
  color?: "primary" | "secondary";
}

export function LockDisplay({ label, positionsRevealed, highlight, color = "primary" }: Props) {
  const ringClass = color === "primary" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground";
  return (
    <div className={`pop-card p-4 ${highlight ? "animate-pop" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-sm uppercase tracking-wide truncate">{label}</span>
        <span className={`text-xs font-mono-arcade px-2 py-1 rounded-md ${ringClass}`}>
          {positionsRevealed}/4
        </span>
      </div>
      <div className="flex gap-2 justify-center">
        {[0, 1, 2, 3].map((i) => {
          const cracked = i < positionsRevealed;
          return (
            <motion.div
              key={i}
              animate={cracked ? { rotateY: 0 } : { rotateY: 0 }}
              className={`w-12 h-14 rounded-lg border-2 border-foreground flex items-center justify-center text-2xl font-mono-arcade font-bold ${
                cracked ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
              }`}
              style={{ boxShadow: "var(--shadow-pop-sm)" }}
            >
              {cracked ? "✓" : "?"}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
