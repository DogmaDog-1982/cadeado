import { supabase } from "@/integrations/supabase/client";
import { calculateRewards, checkMedals } from "../lib/game-logic";

export const useProgression = (profile: any, setProfile: Function) => {
  const updateEndGame = async (isWin: boolean, isOnline: boolean, difficulty: 'easy' | 'hard' | null) => {
    if (!profile) return;

    const { xp: xpGain, coins: coinGain } = calculateRewards(isWin, isOnline, difficulty);
    
    const newStats = {
      xp: profile.xp + xpGain,
      coins: profile.coins + coinGain,
      wins: isWin ? profile.wins + 1 : profile.wins,
      losses: !isWin ? profile.losses + 1 : profile.losses,
      games_played: profile.games_played + 1,
      current_win_streak: isWin ? profile.current_win_streak + 1 : 0,
      max_win_streak: Math.max(profile.max_win_streak, isWin ? profile.current_win_streak + 1 : 0),
    };

    const updatedMedals = checkMedals({ ...profile, ...newStats });

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...newStats,
        medals: updatedMedals
      })
      .eq('id', profile.id)
      .select()
      .single();

    if (!error) setProfile(data);
    return { xpGain, coinGain, newMedals: updatedMedals.length > profile.medals.length };
  };

  const buyResource = async (resourceId: string, price: number) => {
    if (profile.coins < price) return { success: false, msg: "Moedas insuficientes" };

    const newResources = { ...profile.resources_bought };
    newResources[resourceId] = (newResources[resourceId] || 0) + 1;

    const { data, error } = await supabase
      .from('profiles')
      .update({
        coins: profile.coins - price,
        resources_bought: newResources
      })
      .eq('id', profile.id)
      .select()
      .single();

    if (!error) {
      setProfile(data);
      return { success: true };
    }
    return { success: false };
  };

  return { updateEndGame, buyResource };
};
