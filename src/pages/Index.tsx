import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SecretInput } from "@/components/SecretInput";
import { GuessPad } from "@/components/GuessPad";
import { LockDisplay } from "@/components/LockDisplay";
import { GuessHistory } from "@/components/GuessHistory";
import { PlayerHUD } from "@/components/PlayerHUD";
import { ResourceBar } from "@/components/ResourceBar";
import { useProgression } from "@/hooks/useProgression";
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
import { Volume2, VolumeX, Swords, Lock, UserPlus } from "lucide-react";

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
  
  // NOVOS ESTADOS
  const [profile, setProfile] = useState<any>(null);
  const { updateEndGame, buyResource } = useProgression(profile, setProfile);
  const [resourceUsed, setResourceUsed] = useState(false);

  const lastSyncRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const realtimeChannelRef = useRef<any>(null);

  // BOT MODE state
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("easy");
  const [botState, setBotState] = useState<BotState | null>(null);
  const [botShake, setBotShake] = useState(false);
  const [botFinishedSoundPlayed, setBotFinishedSoundPlayed] = useState(false);

  // Carregar Perfil do Banco
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        setProfile(data);
      }
    };
    loadProfile();
  }, []);

  // Restaurar Sessão
  useEffect(() => {
    const restoreSession = async () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const savedSession: Session = JSON.parse(raw);
        setIsConnectingToRoom(true);
        await loadGame(savedSession.gameId);
        setSession(savedSession);
        setMode("playing");
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setIsConnectingToRoom(false);
      }
    };
    restoreSession();
  }, []);

  // Realtime Sync
  useEffect(() => {
    if (!session) return;
    const channel = supabase.channel(`game-${session.gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${session.gameId}` }, 
      (payload) => { if (payload.new) setGame(toGameRow(payload.new)); })
      .subscribe();
    realtimeChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [session?.gameId]);

  // Sons de fim de jogo e atualização de XP
  useEffect(() => {
    if (!game || !session || game.status !== "finished" || finishedSoundPlayed) return;
    const win = game.winner === session.player;
    if (win) sfx.win(); else sfx.lose();
    updateEndGame(win, true, null);
    setFinishedSoundPlayed(true);
  }, [game?.status]);

  async function loadGame(id: string): Promise<GameRow | null> {
    const { data } = await supabase.from("games_public" as any).select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    const nextGame = toGameRow(data);
    setGame(nextGame);
    return nextGame;
  }

  async function handleRandomMatch() {
    if (!name.trim()) return toast.error("Digite seu nome primeiro");
    if (secret.some(d => d < 0)) return toast.error("Defina seu segredo de 4 dígitos");
    
    setIsConnectingToRoom(true);
    // Tenta achar sala aberta
    const { data: openGame } = await supabase.from("games").select("id, code").eq("status", "waiting").eq("is_private", false).limit(1).maybeSingle();

    if (openGame) {
      setJoinCode(openGame.code);
      await handleJoin();
    } else {
      await handleCreate(false); // Cria sala pública
    }
  }

  async function handleCreate(isPrivate = true) {
    const { data, error } = await supabase.rpc("create_game", { _name: name.trim(), _secret: secret });
    if (error) return toast.error("Erro ao criar");
    const row = data[0];
    if (!isPrivate) await supabase.from("games").update({ is_private: false }).eq("id", row.id);
    const s = { gameId: row.id, player: 1, name: name.trim(), secret: [...secret], token: row.token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s as any);
    setMode("playing");
  }

  async function handleJoin() {
    const { data, error } = await supabase.rpc("join_game", { _code: joinCode.trim().toUpperCase(), _name: name.trim(), _secret: secret });
    if (error) return toast.error("Sala cheia ou inválida");
    const row = data[0];
    const s = { gameId: row.game_id, player: 2, name: name.trim(), secret: [...secret], token: row.token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s as any);
    setMode("playing");
  }

  async function handleGuess(n: number) {
    if (!session || !game) return;
    sfx.click();
    const { data, error } = await supabase.rpc("make_guess", { _game_id: session.gameId, _player: session.player, _guess: n, _token: session.token });
    if (error) return toast.error(error.message);
    
    const result = data as { correct: boolean; hint: string };
    if (!result.correct) {
      setShake(true); setTimeout(() => setShake(false), 400);
      result.hint === "higher" ? sfx.hintHigher() : sfx.hintLower();
    } else { sfx.correct(); }
  }

  function leaveGame() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null); setGame(null); setMode("menu");
  }

  // ===== BOT LOGIC REUSED =====
  function startBotGame() {
    if (secret.some(d => d < 0)) return toast.error("Defina seu segredo");
    setBotState(createBotGame(secret, botDifficulty));
    setMode("bot-playing");
  }

  if (mode === "menu") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <PlayerHUD profile={profile} />
        
        <div className="w-full max-w-md space-y-6">
          <header className="text-center space-y-2">
            <h1 className="text-5xl font-mono-arcade font-extrabold">🔒 Cadeado</h1>
            <p className="text-muted-foreground italic">Desvende o segredo.</p>
          </header>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase">Seu Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 border-2 border-foreground rounded-xl bg-card" placeholder="Ex: Ana" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase">Seu Segredo (4 dígitos)</label>
              <SecretInput value={secret} onChange={setSecret} />
            </div>

            <button onClick={handleRandomMatch} className="w-full p-6 bg-primary text-primary-foreground font-black text-xl rounded-2xl flex items-center justify-center gap-3 shadow-[var(--shadow-pop)] active:translate-y-1 transition-all">
              <Swords /> PARTIDA ALEATÓRIA
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMode("create")} className="p-4 bg-secondary font-bold rounded-xl flex items-center justify-center gap-2">
                <UserPlus size={18}/> Criar Privada
              </button>
              <button onClick={() => setMode("join")} className="p-4 bg-secondary font-bold rounded-xl flex items-center justify-center gap-2">
                <Lock size={18}/> Entrar Código
              </button>
            </div>

            <button onClick={() => setMode("bot-setup")} className="w-full p-4 bg-accent font-bold rounded-xl">
              🤖 Treinar com Robô
            </button>
          </div>
        </div>
      </main>
    );
  }

  // TELA DE JOGO (Multiplayer)
  if (mode === "playing" && game && session) {
    const isMyTurn = game.current_turn === session.player && game.status === "playing";
    const myProgress = session.player === 1 ? game.current_position_for_p1 : game.current_position_for_p2;
    const oppProgress = session.player === 1 ? game.current_position_for_p2 : game.current_position_for_p1;
    const finished = game.status === "finished";

    return (
      <main className="min-h-screen p-4 max-w-2xl mx-auto space-y-4">
        <PlayerHUD profile={profile} />
        
        <div className="grid grid-cols-2 gap-3">
          <LockDisplay label="Oponente" positionsRevealed={myProgress} color="primary" highlight={isMyTurn} />
          <LockDisplay label="Você" positionsRevealed={oppProgress} color="secondary" />
        </div>

        <ResourceBar profile={profile} onUse={(id: string) => {
            setResourceUsed(true);
            toast.info("Recurso usado!");
        }} disabled={!isMyTurn || resourceUsed || finished} />

        {finished && (
          <div className="p-8 text-center bg-card border-4 border-foreground rounded-3xl">
            <h2 className="text-3xl font-black">{game.winner === session.player ? "🏆 VOCÊ GANHOU!" : "💀 VOCÊ PERDEU!"}</h2>
            <button onClick={leaveGame} className="mt-4 p-3 bg-primary text-white rounded-xl px-8 font-bold">Voltar</button>
          </div>
        )}

        {!finished && isMyTurn && (
          <div className={`p-4 bg-success/10 border-2 border-success rounded-2xl ${shake ? 'animate-shake' : ''}`}>
             <p className="text-center font-bold mb-2">Adivinhe o dígito #{myProgress + 1}</p>
             <GuessPad onGuess={handleGuess} disabled={false} />
          </div>
        )}

        {!finished && !isMyTurn && (
          <div className="p-8 text-center bg-muted rounded-2xl animate-pulse">
            <p className="font-bold">Aguardando oponente...</p>
          </div>
        )}
      </main>
    );
  }

  return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
};

export default Index;
