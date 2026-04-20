import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SecretInput } from "@/components/SecretInput";
import { GuessPad } from "@/components/GuessPad";
import { LockDisplay } from "@/components/LockDisplay";
import { GuessHistory } from "@/components/GuessHistory";
import { randomSecret, type Guess } from "@/lib/game-utils";
import { sfx, toggleMute } from "@/lib/sfx";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";

type GameRow = {
  id: string;
  code: string;
  player1_name: string | null;
  player2_name: string | null;
  player1_guesses: Guess[];
  player2_guesses: Guess[];
  current_position_for_p1: number;
  current_position_for_p2: number;
  current_turn: number;
  winner: number | null;
  status: string;
};

type Mode = "menu" | "create" | "join" | "playing";

const STORAGE_KEY = "cadeado-session";

interface Session {
  gameId: string;
  player: 1 | 2;
  name: string;
}

const Index = () => {
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [secret, setSecret] = useState<number[]>([-1, -1, -1, -1]);
  const [game, setGame] = useState<GameRow | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [shake, setShake] = useState(false);
  const [muted, setMuted] = useState(sfx.isMuted());
  const [finishedSoundPlayed, setFinishedSoundPlayed] = useState(false);

  // restore session
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const s: Session = JSON.parse(raw);
      setSession(s);
      setMode("playing");
      loadGame(s.gameId);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // realtime subscribe
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`game-${session.gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${session.gameId}` },
        () => loadGame(session.gameId)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.gameId]);

  async function loadGame(id: string) {
    const { data, error } = await supabase
      .from("games_public" as any)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("loadGame error", error);
      return;
    }
    if (!data) {
      // game no longer exists — clear stale session
      localStorage.removeItem(STORAGE_KEY);
      setSession(null);
      setGame(null);
      setMode("menu");
      return;
    }
    setGame(data as any);
  }

  function saveSession(s: Session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
  }

  function leaveGame() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setGame(null);
    setMode("menu");
    setName("");
    setJoinCode("");
    setSecret([-1, -1, -1, -1]);
  }

  async function handleCreate() {
    if (!name.trim()) return toast.error("Digite seu nome");
    if (secret.some((d) => d < 0)) return toast.error("Defina os 4 dígitos do seu segredo");
    sfx.click();
    const { data, error } = await supabase.rpc("create_game", {
      _name: name.trim(),
      _secret: secret,
    });
    if (error || !data || !data[0]) {
      console.error("create_game error", error);
      return toast.error(error?.message ?? "Erro ao criar partida");
    }
    const row = data[0] as { id: string; code: string };
    saveSession({ gameId: row.id, player: 1, name: name.trim() });
    setMode("playing");
    loadGame(row.id);
  }

  async function handleJoin() {
    if (!name.trim()) return toast.error("Digite seu nome");
    if (!joinCode.trim()) return toast.error("Digite o código da sala");
    if (secret.some((d) => d < 0)) return toast.error("Defina os 4 dígitos do seu segredo");
    sfx.click();
    const { data, error } = await supabase.rpc("join_game", {
      _code: joinCode.trim().toUpperCase(),
      _name: name.trim(),
      _secret: secret,
    });
    if (error || !data) return toast.error(error?.message ?? "Erro ao entrar");
    saveSession({ gameId: data as string, player: 2, name: name.trim() });
    setMode("playing");
    loadGame(data as string);
  }

  async function handleGuess(n: number) {
    if (!session || !game) return;
    sfx.click();
    const { data, error } = await supabase.rpc("make_guess", {
      _game_id: session.gameId,
      _player: session.player,
      _guess: n,
    });
    if (error) {
      sfx.miss();
      return toast.error(error.message);
    }
    const result = data as { correct: boolean; hint: string };
    if (!result.correct) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      if (result.hint === "higher") sfx.hintHigher();
      else sfx.hintLower();
      toast(`Errou! Dica: ${result.hint === "higher" ? "MAIS ⬆" : "MENOS ⬇"}`);
    } else {
      sfx.correct();
      toast.success("Acertou! Continue 🔥");
    }
  }

  // ===== UI =====

  if (mode === "menu") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <header className="text-center space-y-2">
            <motion.h1
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-5xl font-mono-arcade font-extrabold tracking-tight"
            >
              🔒 Cadeado
            </motion.h1>
            <p className="text-muted-foreground">Adivinhe o segredo do seu adversário antes que ele descubra o seu.</p>
          </header>
          <div className="space-y-3">
            <button
              onClick={() => setMode("create")}
              className="w-full pop-card p-5 text-xl font-bold bg-primary text-primary-foreground hover:translate-y-[-2px] transition-transform"
            >
              Criar partida
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full pop-card p-5 text-xl font-bold bg-secondary text-secondary-foreground hover:translate-y-[-2px] transition-transform"
            >
              Entrar com código
            </button>
          </div>
          <p className="text-xs text-center text-muted-foreground pt-4">
            Como jogar: cada um define um segredo de 4 dígitos.<br />
            Você tenta adivinhar dígito por dígito. Errou? Recebe a dica MAIS ou MENOS e a vez passa pro adversário.
          </p>
        </div>
      </main>
    );
  }

  if (mode === "create" || mode === "join") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5 pop-card-lg p-6 bg-card">
          <button onClick={() => setMode("menu")} className="text-sm text-muted-foreground hover:underline">
            ← voltar
          </button>
          <h2 className="text-2xl font-bold">{mode === "create" ? "Criar partida" : "Entrar em partida"}</h2>

          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wide">Seu nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              className="w-full px-4 py-3 border-2 border-foreground rounded-xl bg-background focus:outline-none focus:bg-accent/30"
              placeholder="Ex: Ana"
            />
          </div>

          {mode === "join" && (
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wide">Código da sala</label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={10}
                className="w-full px-4 py-3 border-2 border-foreground rounded-xl bg-background font-mono-arcade text-xl tracking-widest text-center uppercase"
                placeholder="XXXXX"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wide">Seu segredo (4 dígitos)</label>
            <SecretInput value={secret} onChange={setSecret} />
            <button
              type="button"
              onClick={() => setSecret(randomSecret())}
              className="text-xs text-muted-foreground hover:underline mx-auto block"
            >
              🎲 sortear pra mim
            </button>
          </div>

          <button
            onClick={mode === "create" ? handleCreate : handleJoin}
            className="w-full pop-card p-4 text-lg font-bold bg-primary text-primary-foreground"
          >
            {mode === "create" ? "Criar e copiar código" : "Entrar"}
          </button>
        </div>
      </main>
    );
  }

  // playing
  if (!game || !session) {
    return <main className="min-h-screen flex items-center justify-center">Carregando…</main>;
  }

  const me = session.player;
  const opp = me === 1 ? 2 : 1;
  const myName = me === 1 ? game.player1_name : game.player2_name;
  const oppName = (me === 1 ? game.player2_name : game.player1_name) ?? "Aguardando…";
  const myProgress = me === 1 ? game.current_position_for_p1 : game.current_position_for_p2;
  const oppProgress = me === 1 ? game.current_position_for_p2 : game.current_position_for_p1;
  const myGuesses = (me === 1 ? game.player1_guesses : game.player2_guesses) as Guess[];
  const oppGuesses = (me === 1 ? game.player2_guesses : game.player1_guesses) as Guess[];
  const isMyTurn = game.current_turn === me && game.status === "playing";
  const finished = game.status === "finished";
  const iWon = game.winner === me;

  // last hint relevant to me (last MISS) -> for current position guess
  const lastMyMiss = [...myGuesses].reverse().find((g) => g.hint !== "correct" && g.position === myProgress);

  if (game.status === "waiting") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-6 pop-card-lg p-8 bg-card">
          <h2 className="text-2xl font-bold">Aguardando adversário…</h2>
          <p className="text-sm text-muted-foreground">Compartilhe o código da sala:</p>
          <div className="bg-accent border-2 border-foreground rounded-xl p-6">
            <div className="text-5xl font-mono-arcade font-extrabold tracking-widest">{game.code}</div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(game.code);
              toast.success("Código copiado!");
            }}
            className="pop-card px-5 py-3 font-bold bg-secondary text-secondary-foreground"
          >
            Copiar código
          </button>
          <button onClick={leaveGame} className="block mx-auto text-sm text-muted-foreground hover:underline">
            cancelar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Sala</div>
          <div className="font-mono-arcade font-bold tracking-widest">{game.code}</div>
        </div>
        <button onClick={leaveGame} className="text-xs text-muted-foreground hover:underline">sair</button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <LockDisplay
          label={`${oppName} (alvo)`}
          positionsRevealed={myProgress}
          color="primary"
          highlight={isMyTurn}
        />
        <LockDisplay
          label={`Você (${myName})`}
          positionsRevealed={oppProgress}
          color="secondary"
        />
      </div>

      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`pop-card-lg p-6 text-center ${iWon ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}
          >
            <div className="text-4xl mb-2">{iWon ? "🏆" : "💔"}</div>
            <div className="text-2xl font-bold">{iWon ? "Você venceu!" : `${oppName} venceu`}</div>
            <button onClick={leaveGame} className="mt-4 pop-card px-5 py-2 bg-card text-foreground font-bold">
              Jogar de novo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!finished && (
        <div className={`pop-card p-4 space-y-3 ${shake ? "animate-shake" : ""}`}>
          <div className="text-center">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {isMyTurn ? "Sua vez — adivinhe a posição" : `Vez de ${oppName}`}
            </div>
            <div className="text-3xl font-mono-arcade font-bold mt-1">
              {isMyTurn ? `#${myProgress + 1}` : "⏳"}
            </div>
            {isMyTurn && lastMyMiss && (
              <div className="mt-2 inline-block px-3 py-1 rounded-md bg-accent border-2 border-foreground font-bold text-sm">
                Última dica: {lastMyMiss.guess} → {lastMyMiss.hint === "higher" ? "MAIS ⬆" : "MENOS ⬇"}
              </div>
            )}
          </div>
          <GuessPad disabled={!isMyTurn} onGuess={handleGuess} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 pop-card p-4">
        <GuessHistory guesses={myGuesses} title="Seus palpites" />
        <div className="border-t-2 border-dashed border-foreground/30 pt-3">
          <GuessHistory guesses={oppGuesses} title={`Palpites de ${oppName}`} />
        </div>
      </div>
    </main>
  );
};

export default Index;
