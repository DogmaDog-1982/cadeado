import React from 'react';
import { RESOURCES } from '../lib/game-logic';

export const ResourceBar = ({ profile, onUse, disabled }: any) => {
  if (!profile) return null;
  return (
    <div className="grid grid-cols-4 gap-2 my-4">
      {RESOURCES.map(res => (
        <button
          key={res.id}
          disabled={disabled || (profile.resources_bought?.[res.id] || 0) <= 0}
          onClick={() => onUse(res.id)}
          className="flex flex-col items-center p-2 rounded-xl border-2 border-foreground bg-card disabled:opacity-30"
          style={{ boxShadow: "var(--shadow-pop-sm)" }}
        >
          <span className="text-xl">{res.icon}</span>
          <span className="text-[10px] font-bold">Qt: {profile.resources_bought?.[res.id] || 0}</span>
        </button>
      ))}
    </div>
  );
};
