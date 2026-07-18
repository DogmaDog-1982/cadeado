import React from 'react';
import { RESOURCES, getLevel } from '../lib/game-logic';

export const GameMenus = ({ profile, onBuy }: { profile: any, onBuy: (id: string, price: number) => void }) => {
  if (!profile) return null;

  return (
    <div className="space-y-6 p-4 bg-slate-900 rounded-3xl border border-white/10 shadow-2xl">
      {/* SEÇÃO DE ESTATÍSTICAS */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-white/5 p-3 rounded-xl">
          <p className="text-[10px] text-gray-400 uppercase">Vitórias</p>
          <p className="text-xl font-bold text-green-400">{profile.wins}</p>
        </div>
        <div className="bg-white/5 p-3 rounded-xl">
          <p className="text-[10px] text-gray-400 uppercase">Partidas</p>
          <p className="text-xl font-bold text-blue-400">{profile.games_played}</p>
        </div>
      </div>

      {/* SEÇÃO DA LOJA */}
      <div>
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">🛒 Loja de Recursos</h3>
        <div className="space-y-2">
          {RESOURCES.map((res) => {
            const levelData = getLevel(profile.xp);
            const canUnlock = profile.xp >= (RESOURCES.find(r => r.id === res.id)?.price || 0); // Simplificado para exemplo
            
            return (
              <div key={res.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{res.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-white">{res.name}</p>
                    <p className="text-[10px] text-gray-400">{res.desc}</p>
                  </div>
                </div>
                <button 
                  onClick={() => onBuy(res.id, res.price)}
                  disabled={profile.coins < res.price}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${profile.coins >= res.price ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-500'}`}
                >
                  {res.price} 🪙
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
