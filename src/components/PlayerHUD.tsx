import React from 'react';
import { getLevel } from '../lib/game-logic';

interface PlayerHUDProps {
  profile: any;
}

export const PlayerHUD = ({ profile }: PlayerHUDProps) => {
  if (!profile) return null;
  const level = getLevel(profile.xp);

  return (
    <div className="flex flex-col gap-2 p-4 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 mb-6 w-full max-w-md mx-auto shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-3xl bg-white/5 p-2 rounded-full shadow-inner">{level.badge}</div>
          <div>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">{level.name}</p>
            <p className="text-lg font-bold text-white leading-tight">{profile.username || 'Jogador'}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-yellow-400 font-bold">
            <span>🪙</span>
            <span>{profile.coins}</span>
          </div>
          <p className="text-[10px] text-gray-400 font-mono">{profile.xp} XP total</p>
        </div>
      </div>
      
      {/* Barra de Progresso para o próximo nível */}
      <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
        <div 
          className="bg-blue-500 h-full transition-all duration-500" 
          style={{ width: `${Math.min((profile.xp % 500) / 5, 100)}%` }}
        />
      </div>

      {/* Medalhas Simplificadas */}
      {profile.medals?.length > 0 && (
        <div className="flex gap-1 mt-1 overflow-x-auto pb-1">
          {profile.medals.map((m: string, i: number) => (
            <span key={i} title={m} className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-gray-300 whitespace-nowrap">
              🏅 {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
