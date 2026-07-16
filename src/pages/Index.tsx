import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SecretInput } from "@/components/SecretInput";
import { GuessPad } from "@/components/GuessPad";
import { LockDisplay } from "@/components/LockDisplay";
import { GuessHistory } from "@/components/GuessHistory";
import { randomSecret, type Guess } from "@/lib/game-utils";
import {
  type BotState,
  type BotDifficulty,
  createBotGame,
  playerGuess as botPlayerGuess,
  pickBotGuess,
  botGuess as botMakeGuess,
} from "@/lib/bot-game";
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

type Mode = "menu" | "create" | "join" | "reconnect" | "playing" | "bot-setup" | "bot-playing";

const STORAGE_KEY = "cadeado-session";

interface Session {
  gameId: string;
  player: 1 | 2;
  name: string;
  secret?: number[];
  token?: string;
}

function toGameRow(row: any): GameRow {
  return {
    id: row.id,
    code: row.code,
    player1_name: row.player1_name,
    player2_name: row.player2_name,
    player1_guesses: row.player1_guesses ?? [],
    player2_guesses: row.player2_guesses ?? [],
    current_position_for_p1: row.current_position_for_p1 ?? 0,
    current_position_for_p2: row.current_position_for_p2 ?? 0,
    current_turn: row.current_turn ?? 1,
    winner: row.winner ?? null,
    status: row.status,
  };
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
  const [isConnectingToRoom, setIsConnectingToRoom] = useState(false);
  const lastSyncRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const realtimeChannelRef = useRef<any>(null);

  // ===== BOT MODE state (totally local, no backend) =====
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("easy");
  const [botState, setBotState] = useState<BotState | null>(null);
  const [botShake, setBotShake] = useState(false);
  const [botFinishedSoundPlayed, setBotFinishedSoundPlayed] = useState(false);

  // restore session
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      try {
        const savedSession: Session = JSON.parse(raw);
        setIsConnectingToRoom(true);
        const restoredGame = await loadGame(savedSession.gameId);
        if (!restoredGame || cancelled) return;

        saveSession(savedSession);
        setMode("playing");
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        if (!cancelled) {
          setIsConnectingToRoom(false);
        }
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // realtime subscribe
  useEffect(() => {
    if (!session) return;

    let disposed = false;
    const pollIntervalMs = 300;
    const staleAfterMs = 250;

    const syncGame = async () => {
      if (syncInFlightRef.current) return;

      syncInFlightRef.current = true;
      try {
        await loadGame(session.gameId);
      } finally {
        syncInFlightRef.current = false;
      }
    };

    const channel = supabase
      .channel(`game-${session.gameId}`)
      .on("broadcast", { event: "game-changed" }, (payload) => {
        if (payload.payload?.gameId && payload.payload.gameId !== session.gameId) return;
        lastSyncRef.current = 0;
        void syncGame();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${session.gameId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          lastSyncRef.current = Date.now();
          if (payload.new) {
            setGame(toGameRow(payload.new));
            return;
          }
          void syncGame();
        }
      )
      .subscribe((status) => {
        if (disposed) return;

        if (status === "SUBSCRIBED") {
          void syncGame();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          void syncGame();
        }
      });
    realtimeChannelRef.current = channel;

    const handleResumeSync = () => {
      void syncGame();
    };

    const safetyPollInterval = window.setInterval(() => {
      if (disposed) return;
      if (Date.now() - lastSyncRef.current < staleAfterMs) return;
      void syncGame();
    }, pollIntervalMs);

    window.addEventListener("focus", handleResumeSync);
    window.addEventListener("online", handleResumeSync);
    document.addEventListener("visibilitychange", handleResumeSync);

    return () => {
      disposed = true;
      window.removeEventListener("focus", handleResumeSync);
      window.removeEventListener("online", handleResumeSync);
      document.removeEventListener("visibilitychange", handleResumeSync);
      window.clearInterval(safetyPollInterval);
      if (realtimeChannelRef.current === channel) realtimeChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [session?.gameId]);

  // play win/lose sound when game finishes
  useEffect(() => {
    if (!game || !session) return;
    if (game.status === "finished" && !finishedSoundPlayed) {
      if (game.winner === session.player) sfx.win();
      else sfx.lose();
      setFinishedSoundPlayed(true);
    }
    if (game.status !== "finished" && finishedSoundPlayed) {
      setFinishedSoundPlayed(false);
    }
  }, [game?.status, game?.winner, session?.player, finishedSoundPlayed]);

  // sync mute state to sfx module
  useEffect(() => {
    sfx.setMuted(muted);
  }, [muted]);

  // ===== BOT effects =====
  // Auto-play bot turn after a short delay
  useEffect(() => {
    if (!botState) return;
    if (botState.status !== "playing") return;
    if (botState.currentTurn !== 2) return;
    const t = setTimeout(() => {
      const guess = pickBotGuess(botState);
      const { state: next, correct, hint } = botMakeGuess(botState, guess);
      sfx.click();
      if (correct) {
        sfx.correct();
        toast(`🤖 Robô acertou o dígito #${botState.botProgress + 1}!`);
      } else {
        if (hint === "higher") sfx.hintHigher();
        else sfx.hintLower();
        toast(`🤖 Robô chutou ${guess} → errou`);
      }
      setBotState(next);
    }, 900);
    return () => clearTimeout(t);
  }, [botState]);

  // Win/lose sound for bot game
  useEffect(() => {
    if (!botState) return;
    if (botState.status === "finished" && !botFinishedSoundPlayed) {
      if (botState.winner === 1) sfx.win();
      else sfx.lose();
      setBotFinishedSoundPlayed(true);
    }
    if (botState.status !== "finished" && botFinishedSoundPlayed) {
      setBotFinishedSoundPlayed(false);
    }
  }, [botState?.status, botState?.winner, botFinishedSoundPlayed]);

  function startBotGame() {
    if (secret.some((d) => d < 0)) return toast.error("Defina os 4 dígitos do seu segredo");
    sfx.click();
    const s = createBotGame(secret, botDifficulty);
    setBotState(s);
    setMode("bot-playing");
    toast.success(s.startedBy === 1 ? "Você começa!" : "Robô começa!");
  }

  function leaveBotGame() {
    setBotState(null);
    setMode("menu");
    setName("");
    setSecret([-1, -1, -1, -1]);
  }

  function handleBotPlayerGuess(n: number) {
    if (!botState) return;
    sfx.click();
    const { state: next, correct, hint } = botPlayerGuess(botState, n);
    if (!correct) {
      setBotShake(true);
      setTimeout(() => setBotShake(false), 400);
      if (hint === "higher") sfx.hintHigher();
      else sfx.hintLower();
      toast(`Errou! Dica: ${hint === "higher" ? "MAIS ⬆" : "MENOS ⬇"}`);
    } else {
      sfx.correct();
      toast.success("Acertou! Continue 🔥");
    }
    setBotState(next);
  }


  async function loadGame(id: string): Promise<GameRow | null> {
    const { data, error } = await supabase
      .from("games_public" as any)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("loadGame error", error);
      return null;
    }
    if (!data) {
      // game no longer exists — clear stale session
      localStorage.removeItem(STORAGE_KEY);
      setSession(null);
      setGame(null);
      setMode("menu");
      return null;
    }
    const nextGame = toGameRow(data);
    lastSyncRef.current = Date.now();
    setGame(nextGame);
    return nextGame;
  }

  async function enterRoom(nextSession: Session) {
    setIsConnectingToRoom(true);
    const nextGame = await loadGame(nextSession.gameId);
    if (!nextGame) {
      setIsConnectingToRoom(false);
      return false;
    }

    saveSession(nextSession);
    setMode("playing");
    setIsConnectingToRoom(false);
    return true;
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
    const row = data[0] as { id: string; code: string; token: string };
    await enterRoom({ gameId: row.id, player: 1, name: name.trim(), secret: [...secret], token: row.token });
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
    if (error || !data || !(data as any[])[0]) {
      // If room is full, suggest reconnect
      if (error?.message?.includes("game full")) {
        toast.error("Sala cheia. Se você já estava nela, use 'Reconectar'.");
      } else {
        toast.error(error?.message ?? "Erro ao entrar");
      }
      return;
    }
    const row = (data as any[])[0] as { game_id: string; token: string };
    await enterRoom({ gameId: row.game_id, player: 2, name: name.trim(), secret: [...secret], token: row.token });
  }

  async function handleReconnect() {
    if (!name.trim()) return toast.error("Digite o nome que você usou na sala");
    if (!joinCode.trim()) return toast.error("Digite o código da sala");
    if (!session?.token) {
      return toast.error("Sessão original não encontrada neste dispositivo. Por segurança, só é possível reconectar do mesmo aparelho/navegador em que você entrou.");
    }
    sfx.click();
    const { data, error } = await supabase.rpc("reconnect_game", {
      _code: joinCode.trim().toUpperCase(),
      _name: name.trim(),
      _token: session.token,
    });
    if (error || !data || !data[0]) {
      return toast.error(error?.message ?? "Não foi possível reconectar. Confira código e nome.");
    }
    const row = data[0] as { game_id: string; player: number; token: string; secret: number[] };
    const connected = await enterRoom({
      gameId: row.game_id,
      player: row.player as 1 | 2,
      name: name.trim(),
      secret: row.secret ?? undefined,
      token: row.token,
    });
    if (connected) {
      toast.success(`Reconectado como Jogador ${row.player}!`);
    }
  }

  async function resumeSavedSession() {
    if (!session) return;
    sfx.click();
    await enterRoom(session);
  }

  async function handleGuess(n: number) {
    if (!session || !game) return;
    sfx.click();
    if (!session.token) {
      return toast.error("Sessão inválida. Reconecte-se à sala.");
    }
    const { data, error } = await supabase.rpc("make_guess", {
      _game_id: session.gameId,
      _player: session.player,
      _guess: n,
      _token: session.token,
    });
    if (error) {
      sfx.miss();
      return toast.error(error.message);
    }
    void realtimeChannelRef.current?.send({
      type: "broadcast",
      event: "game-changed",
      payload: { gameId: session.gameId },
    }).catch((error: unknown) => console.warn("broadcast game-changed failed", error));
    void loadGame(session.gameId);
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
          {session && (
            <div className="pop-card p-4 bg-success/20 border-success space-y-2">
              <div className="text-sm font-bold">🎮 Você tem uma partida em andamento</div>
              <div className="text-xs text-muted-foreground">
                Como <strong>{session.name}</strong> (Jogador {session.player})
              </div>
              <button
                onClick={resumeSavedSession}
                className="w-full pop-card p-3 font-bold bg-success text-success-foreground"
              >
                ▶ Voltar para a partida
              </button>
            </div>
          )}
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground text-center">
              👥 Multijogador
            </div>
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
            <button
              onClick={() => setMode("reconnect")}
              className="w-full pop-card p-3 text-sm font-bold bg-card text-foreground hover:translate-y-[-2px] transition-transform"
            >
              🔄 Reconectar a uma sala (mesmo nome)
            </button>

            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground text-center pt-3">
              🤖 Solo
            </div>
            <button
              onClick={() => {
                setSecret([-1, -1, -1, -1]);
                setMode("bot-setup");
              }}
              className="w-full pop-card p-5 text-xl font-bold bg-accent text-accent-foreground hover:translate-y-[-2px] transition-transform"
            >
              Jogar contra o robô
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

  if (mode === "reconnect") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5 pop-card-lg p-6 bg-card">
          <button onClick={() => setMode("menu")} className="text-sm text-muted-foreground hover:underline">
            ← voltar
          </button>
          <h2 className="text-2xl font-bold">🔄 Reconectar</h2>
          <p className="text-sm text-muted-foreground">
            Use isso se você foi desconectado, fechou o navegador ou está em outro dispositivo.
            Digite o <strong>mesmo nome</strong> que você usou ao entrar na sala.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wide">Seu nome (igual ao da sala)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              className="w-full px-4 py-3 border-2 border-foreground rounded-xl bg-background focus:outline-none focus:bg-accent/30"
              placeholder="Ex: Ana"
            />
          </div>

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

          <button
            onClick={handleReconnect}
            className="w-full pop-card p-4 text-lg font-bold bg-primary text-primary-foreground"
          >
            Reconectar
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            Seu segredo original e seu progresso são preservados — você não precisa redefini-los.
          </p>
        </div>
      </main>
    );
  }

  // ===== BOT SETUP =====
  if (mode === "bot-setup") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5 pop-card-lg p-6 bg-card">
          <button onClick={() => setMode("menu")} className="text-sm text-muted-foreground hover:underline">
            ← voltar
          </button>
          <h2 className="text-2xl font-bold">🤖 Jogar contra o robô</h2>
          <p className="text-sm text-muted-foreground">
            Partida solo, totalmente offline. Defina seu segredo e a dificuldade.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wide">Dificuldade do robô</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setBotDifficulty("easy")}
                className={`pop-card p-3 font-bold text-sm transition-transform ${
                  botDifficulty === "easy"
                    ? "bg-primary text-primary-foreground scale-105"
                    : "bg-card text-foreground"
                }`}
              >
                😄 Fácil
                <div className="text-[10px] font-normal opacity-80 mt-1">Chuta aleatório</div>
              </button>
              <button
                onClick={() => setBotDifficulty("hard")}
                className={`pop-card p-3 font-bold text-sm transition-transform ${
                  botDifficulty === "hard"
                    ? "bg-primary text-primary-foreground scale-105"
                    : "bg-card text-foreground"
                }`}
              >
                🧠 Difícil
                <div className="text-[10px] font-normal opacity-80 mt-1">Usa as dicas</div>
              </button>
            </div>
          </div>

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
            onClick={startBotGame}
            className="w-full pop-card p-4 text-lg font-bold bg-primary text-primary-foreground"
          >
            Começar partida
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            Quem começa a primeira jogada é sorteado aleatoriamente.
          </p>
        </div>
      </main>
    );
  }

  // ===== BOT PLAYING =====
  if (mode === "bot-playing" && botState) {
    const myProgress = botState.playerProgress;
    const oppProgress = botState.botProgress;
    const myGuesses = botState.playerGuesses;
    const oppGuesses = botState.botGuesses;
    const isMyTurn = botState.currentTurn === 1 && botState.status === "playing";
    const finished = botState.status === "finished";
    const iWon = botState.winner === 1;
    const lastMyMiss = [...myGuesses].reverse().find((g) => g.hint !== "correct" && g.position === myProgress);
    const oppLabel = `Robô (${botState.difficulty === "easy" ? "Fácil" : "Difícil"})`;

    return (
      <main className="min-h-screen p-4 max-w-2xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Modo</div>
            <div className="font-mono-arcade font-bold tracking-widest">🤖 SOLO</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMuted(toggleMute())}
              className="p-2 rounded-lg border-2 border-foreground bg-card"
              style={{ boxShadow: "var(--shadow-pop-sm)" }}
              aria-label={muted ? "Ativar som" : "Silenciar"}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={leaveBotGame} className="text-xs text-muted-foreground hover:underline">sair</button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <LockDisplay
            label={`${oppLabel} (alvo)`}
            positionsRevealed={myProgress}
            color="primary"
            highlight={isMyTurn}
          />
          <LockDisplay
            label="Você"
            positionsRevealed={oppProgress}
            color="secondary"
          />
        </div>

        <div className="pop-card p-3 bg-accent/40">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              🔑 Seu segredo
            </span>
            <div className="flex gap-1.5">
              {botState.playerSecret.map((d, i) => {
                const cracked = i < oppProgress;
                return (
                  <div
                    key={i}
                    className={`w-9 h-10 rounded-md border-2 border-foreground flex items-center justify-center font-mono-arcade font-bold text-lg ${
                      cracked ? "bg-destructive/30 line-through" : "bg-card"
                    }`}
                    style={{ boxShadow: "var(--shadow-pop-sm)" }}
                  >
                    {d}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Visível só para você. Dígitos riscados já foram descobertos pelo robô.
          </p>
        </div>

        <AnimatePresence>
          {finished && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`pop-card-lg p-6 text-center ${iWon ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}
            >
              <div className="text-4xl mb-2">{iWon ? "🏆" : "💔"}</div>
              <div className="text-2xl font-bold">{iWon ? "Você venceu o robô!" : "O robô venceu"}</div>
              {!iWon && (
                <div className="text-xs mt-2 opacity-90">
                  Segredo do robô era: <span className="font-mono-arcade font-bold">{botState.botSecret.join(" ")}</span>
                </div>
              )}
              <button onClick={leaveBotGame} className="mt-4 pop-card px-5 py-2 bg-card text-foreground font-bold">
                Jogar de novo
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!finished && (
          <>
            {isMyTurn ? (
              <motion.div
                key="my-turn-bot"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`pop-card-lg p-4 space-y-4 bg-success/20 border-success ${botShake ? "animate-shake" : ""}`}
              >
                <div className="text-center space-y-2">
                  <div className="inline-block px-4 py-1 rounded-full bg-success text-success-foreground font-bold text-sm uppercase tracking-wider">
                    ✅ Sua vez!
                  </div>
                  <div className="text-lg font-bold">
                    Adivinhe o dígito <span className="font-mono-arcade text-2xl">#{myProgress + 1}</span> do segredo do robô
                  </div>
                  {lastMyMiss && (
                    <div className="inline-block px-3 py-1 rounded-md bg-accent border-2 border-foreground font-bold text-sm">
                      Última dica: você chutou {lastMyMiss.guess} → tente {lastMyMiss.hint === "higher" ? "MAIOR ⬆" : "MENOR ⬇"}
                    </div>
                  )}
                </div>
                <GuessPad disabled={false} onGuess={handleBotPlayerGuess} />
              </motion.div>
            ) : (
              <motion.div
                key="wait-bot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pop-card-lg p-8 text-center bg-muted/40 space-y-3"
              >
                <div className="text-5xl">🤖</div>
                <div className="text-xl font-bold uppercase tracking-wide">Robô pensando…</div>
                <div className="text-sm text-muted-foreground">
                  Quando ele errar, é a sua vez.
                </div>
              </motion.div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 gap-3 pop-card p-4">
          <GuessHistory guesses={myGuesses} title="Seus palpites" />
          <div className="border-t-2 border-dashed border-foreground/30 pt-3">
            <GuessHistory guesses={oppGuesses} title={`Palpites do ${oppLabel}`} />
          </div>
        </div>
      </main>
    );
  }

  if (isConnectingToRoom || (mode === "playing" && (!game || !session))) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-3 pop-card-lg p-8 bg-card">
          <div className="text-3xl">🔒</div>
          <div className="text-xl font-bold">Entrando na sala…</div>
          <div className="text-sm text-muted-foreground">Sincronizando a partida sem trocar o fluxo do jogo.</div>
        </div>
      </main>
    );
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
        <div className="w-full max-w-md text-center space-y-5 pop-card-lg p-8 bg-card">
          <div className="inline-block px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide">
            ✓ Você já está na sala
          </div>
          <h2 className="text-2xl font-bold">Aguardando adversário…</h2>
          <p className="text-sm text-muted-foreground">
            Você é o <strong>Jogador 1</strong>. Fique nesta tela — o jogo começa automaticamente quando o adversário entrar.
          </p>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide font-bold text-muted-foreground">Envie este código para o adversário:</p>
            <div className="bg-accent border-2 border-foreground rounded-xl p-6">
              <div className="text-5xl font-mono-arcade font-extrabold tracking-widest">{game.code}</div>
            </div>
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
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            ⚠️ Não use este código para "entrar na sala" — ele é só para o adversário. Se você tentar entrar com ele, vai dar "game full" porque seu lugar já está reservado aqui.
          </p>
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMuted(toggleMute())}
            className="p-2 rounded-lg border-2 border-foreground bg-card"
            style={{ boxShadow: "var(--shadow-pop-sm)" }}
            aria-label={muted ? "Ativar som" : "Silenciar"}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={leaveGame} className="text-xs text-muted-foreground hover:underline">sair</button>
        </div>
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

      {session.secret && session.secret.length === 4 && (
        <div className="pop-card p-3 bg-accent/40">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              🔑 Seu segredo
            </span>
            <div className="flex gap-1.5">
              {session.secret.map((d, i) => {
                const cracked = i < oppProgress;
                return (
                  <div
                    key={i}
                    className={`w-9 h-10 rounded-md border-2 border-foreground flex items-center justify-center font-mono-arcade font-bold text-lg ${
                      cracked ? "bg-destructive/30 line-through" : "bg-card"
                    }`}
                    style={{ boxShadow: "var(--shadow-pop-sm)" }}
                  >
                    {d}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Visível só para você. Dígitos riscados já foram descobertos pelo adversário.
          </p>
        </div>
      )}

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
        <>
          {isMyTurn ? (
            <motion.div
              key="my-turn"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`pop-card-lg p-4 space-y-4 bg-success/20 border-success ${shake ? "animate-shake" : ""}`}
            >
              <div className="text-center space-y-2">
                <div className="inline-block px-4 py-1 rounded-full bg-success text-success-foreground font-bold text-sm uppercase tracking-wider">
                  ✅ Sua vez!
                </div>
                <div className="text-lg font-bold">
                  Adivinhe o dígito <span className="font-mono-arcade text-2xl">#{myProgress + 1}</span> do segredo de {oppName}
                </div>
                {lastMyMiss && (
                  <div className="inline-block px-3 py-1 rounded-md bg-accent border-2 border-foreground font-bold text-sm">
                    Última dica: você chutou {lastMyMiss.guess} → tente {lastMyMiss.hint === "higher" ? "MAIOR ⬆" : "MENOR ⬇"}
                  </div>
                )}
                <div className="text-sm font-bold text-foreground pt-1">
                  👇 Escolha um número e toque em ENVIAR
                </div>
              </div>
              <GuessPad disabled={false} onGuess={handleGuess} />
            </motion.div>
          ) : (
            <motion.div
              key="wait-turn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="pop-card-lg p-8 text-center bg-muted/40 space-y-3"
            >
              <div className="text-5xl">⏳</div>
              <div className="text-xl font-bold uppercase tracking-wide">Aguarde…</div>
              <div className="text-sm text-muted-foreground">
                <span className="font-bold text-foreground">{oppName}</span> está jogando.
                <br />Quando errar, é a sua vez.
              </div>
            </motion.div>
          )}
        </>
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
