export function randomCode(len = 5): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function randomSecret(): number[] {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 10));
}

export type Guess = { position: number; guess: number; hint: "higher" | "lower" | "correct" };
