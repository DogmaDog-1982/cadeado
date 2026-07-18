export const LEVELS = [
  { name: 'Aprendiz', minXp: 0, badge: '🔰' },
  { name: 'Praticante', minXp: 500, badge: '🛡️' },
  { name: 'Especialista', minXp: 1500, badge: '⚔️' },
  { name: 'Perito', minXp: 3500, badge: '🏅' },
  { name: 'Mestre', minXp: 7000, badge: '💎' },
  { name: 'Elite', minXp: 12000, badge: '👑' },
  { name: 'Lenda', minXp: 20000, badge: '🌌' }
];

export const RESOURCES = [
  { id: 'scanner', name: 'Scanner', price: 15, level: 'Praticante', icon: '🔍', desc: 'Mostra o intervalo do número' },
  { id: 'xray', name: 'Raio-X', price: 30, level: 'Especialista', icon: '🦴', desc: 'Revela um número do segredo' },
  { id: 'second_guess', name: '2º Palpite', price: 50, level: 'Perito', icon: '🔁', desc: 'Dá um palpite extra imediato' },
  { id: 'spy', name: 'Espionar', price: 100, level: 'Mestre', icon: '👁️', desc: 'Revela o próximo número exato' }
];

export const getLevel = (xp: number) => {
  return [...LEVELS].reverse().find(l => xp >= l.minXp) || LEVELS[0];
};

export const checkMedals = (stats: any) => {
  const newMedals = [...(stats.medals || [])];
  const add = (m: string) => { if (!newMedals.includes(m)) newMedals.push(m); };

  if (stats.wins >= 1) add("Primeiro Cadeado");
  if (stats.wins >= 10) add("Caçador");
  if (stats.wins >= 50) add("Especialista");
  if (stats.max_win_streak >= 5) add("Invencível");
  if (stats.coins >= 500) add("Economista");
  if (stats.games_played >= 100) add("Persistente");
  
  return newMedals;
};
