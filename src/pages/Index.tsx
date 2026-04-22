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

type Mode = "menu" | "create" | "join" | "reconnect" | "playing";

const STORAGE_KEY = "cadeado-session";

interface Session {
  gameId: string;
  player: 1 | 2;
  name: string;
  secret?: number[];
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
    saveSession({ gameId: row.id, player: 1, name: name.trim(), secret: [...secret] });
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
    if (error || !data) {
      // If room is full, suggest reconnect
      if (error?.message?.includes("game full")) {
        toast.error("Sala cheia. Se você já estava nela, use 'Reconectar'.");
      } else {
        toast.error(error?.message ?? "Erro ao entrar");
      }
      return;
    }
    saveSession({ gameId: data as string, player: 2, name: name.trim(), secret: [...secret] });
    setMode("playing");
    loadGame(data as string);
  }

  async function handleReconnect() {
    if (!name.trim()) return toast.error("Digite o nome que você usou na sala");
    if (!joinCode.trim()) return toast.error("Digite o código da sala");
    sfx.click();
    const { data, error } = await supabase.rpc("reconnect_game", {
      _code: joinCode.trim().toUpperCase(),
      _name: name.trim(),
    });
    if (error || !data || !data[0]) {
      return toast.error(error?.message ?? "Não foi possível reconectar. Confira código e nome.");
    }
    const row = data[0] as { game_id: string; player: number };
    // fetch own secret to display during the game
    const { data: gameRow } = await supabase
      .from("games")
      .select("player1_secret,player2_secret")
      .eq("id", row.game_id)
      .maybeSingle();
    const mySecret = row.player === 1 ? gameRow?.player1_secret : gameRow?.player2_secret;
    saveSession({
      gameId: row.game_id,
      player: row.player as 1 | 2,
      name: name.trim(),
      secret: mySecret ?? undefined,
    });
    setMode("playing");
    loadGame(row.game_id);
    toast.success(`Reconectado como Jogador ${row.player}!`);
  }

  function resumeSavedSession() {
    if (!session) return;
    sfx.click();
    setMode("playing");
    loadGame(session.gameId);
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
