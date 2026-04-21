import { useState } from "react";

interface Props {
  disabled?: boolean;
  onGuess: (n: number) => void;
}

export function GuessPad({ disabled, onGuess }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const pick = (n: number) => {
    if (disabled || sending) return;
    setSelected(n);
  };

  const confirm = async () => {
    if (selected === null || disabled || sending) return;
    setSending(true);
    try {
      await onGuess(selected);
      setSelected(null);
    } finally {
      setSending(false);
    }
  };

  const cancel = () => {
    if (sending) return;
    setSelected(null);
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }, (_, n) => {
          const isSelected = selected === n;
          return (
            <button
              key={n}
              disabled={disabled || sending}
              onClick={() => pick(n)}
              className={`aspect-square text-2xl font-mono-arcade font-bold border-2 border-foreground rounded-xl active:translate-x-[2px] active:translate-y-[2px] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                disabled
                  ? "bg-card text-muted-foreground"
                  : isSelected
                  ? "bg-accent text-accent-foreground scale-105 ring-4 ring-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105"
              }`}
              style={{ boxShadow: "var(--shadow-pop-sm)" }}
            >
              {n}
            </button>
          );
        })}
      </div>

      {!disabled && (
        <div className="rounded-xl border-2 border-foreground bg-card p-3 space-y-2" style={{ boxShadow: "var(--shadow-pop-sm)" }}>
          {selected === null ? (
            <div className="text-center text-sm text-muted-foreground font-bold">
              Toque num número acima para escolher
            </div>
          ) : (
            <>
              <div className="text-center text-sm font-bold">
                Palpite escolhido: <span className="font-mono-arcade text-2xl text-primary">{selected}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={cancel}
                  disabled={sending}
                  className="py-3 rounded-xl border-2 border-foreground bg-card font-bold hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirm}
                  disabled={sending}
                  className={`py-3 rounded-xl border-2 border-foreground bg-success text-success-foreground font-bold uppercase tracking-wider hover:bg-success/90 disabled:opacity-50 ${sending ? "animate-pulse" : ""}`}
                  style={{ boxShadow: "var(--shadow-pop-sm)" }}
                >
                  {sending ? "Enviando…" : "Enviar ✓"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
