import type { Guess } from "./game-utils";

export type BotDifficulty = "easy" | "hard";

export interface BotState {
  playerSecret: number[];
  botSecret: number[];
  difficulty: BotDifficulty;
  // progress = next position to crack (0..4)
  playerProgress: number;
  botProgress: number;
  playerGuesses: Guess[];
  botGuesses: Guess[];
  // For each position, the bounds the bot has narrowed down for the player's secret.
  // min inclusive, max inclusive. Starts [0,9].
  botBounds: { min: number; max: number }[];
  currentTurn: 1 | 2; // 1 = player, 2 = bot
  status: "playing" | "finished";
  winner: 1 | 2 | null;
  startedBy: 1 | 2;
}

export function initialBotBounds(): { min: number; max: number }[] {
  return Array.from({ length: 4 }, () => ({ min: 0, max: 9 }));
}

export function createBotGame(
  playerSecret: number[],
  difficulty: BotDifficulty
): BotState {
  const botSecret = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10));
  const startedBy: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
  return {
    playerSecret: [...playerSecret],
    botSecret,
    difficulty,
    playerProgress: 0,
    botProgress: 0,
    playerGuesses: [],
    botGuesses: [],
    botBounds: initialBotBounds(),
    currentTurn: startedBy,
    status: "playing",
    winner: null,
    startedBy,
  };
}

/** Player makes a guess against the bot's secret. Returns updated state + result. */
export function playerGuess(
  state: BotState,
  guess: number
): { state: BotState; correct: boolean; hint: "higher" | "lower" | "correct" } {
  if (state.status !== "playing" || state.currentTurn !== 1) {
    return { state, correct: false, hint: "higher" };
  }
  const pos = state.playerProgress;
  const actual = state.botSecret[pos];
  let hint: "higher" | "lower" | "correct";
  let correct: boolean;
  let newPos = pos;
  if (guess === actual) {
    hint = "correct";
    correct = true;
    newPos = pos + 1;
  } else if (guess < actual) {
    hint = "higher";
    correct = false;
  } else {
    hint = "lower";
    correct = false;
  }
  const newGuesses: Guess[] = [...state.playerGuesses, { position: pos, guess, hint }];
  const finished = correct && newPos >= 4;
  return {
    state: {
      ...state,
      playerGuesses: newGuesses,
      playerProgress: newPos,
      currentTurn: correct ? 1 : 2,
      status: finished ? "finished" : "playing",
      winner: finished ? 1 : null,
    },
    correct,
    hint,
  };
}

/** Bot picks a digit based on its difficulty + memory of past hints. */
export function pickBotGuess(state: BotState): number {
  const pos = state.botProgress;
  if (state.difficulty === "easy") {
    return Math.floor(Math.random() * 10);
  }
  // hard: binary-search using bounds
  const { min, max } = state.botBounds[pos];
  return Math.floor((min + max) / 2);
}

/** Apply the bot's guess against the player's secret, updating bounds. */
export function botGuess(
  state: BotState,
  guess: number
): { state: BotState; correct: boolean; hint: "higher" | "lower" | "correct" } {
  if (state.status !== "playing" || state.currentTurn !== 2) {
    return { state, correct: false, hint: "higher" };
  }
  const pos = state.botProgress;
  const actual = state.playerSecret[pos];
  let hint: "higher" | "lower" | "correct";
  let correct: boolean;
  let newPos = pos;
  const newBounds = state.botBounds.map((b) => ({ ...b }));

  if (guess === actual) {
    hint = "correct";
    correct = true;
    newPos = pos + 1;
  } else if (guess < actual) {
    hint = "higher";
    correct = false;
    // actual > guess => raise min
    newBounds[pos].min = Math.max(newBounds[pos].min, guess + 1);
  } else {
    hint = "lower";
    correct = false;
    newBounds[pos].max = Math.min(newBounds[pos].max, guess - 1);
  }

  const newGuesses: Guess[] = [...state.botGuesses, { position: pos, guess, hint }];
  const finished = correct && newPos >= 4;
  return {
    state: {
      ...state,
      botGuesses: newGuesses,
      botProgress: newPos,
      botBounds: newBounds,
      currentTurn: correct ? 2 : 1,
      status: finished ? "finished" : "playing",
      winner: finished ? 2 : null,
    },
    correct,
    hint,
  };
}
