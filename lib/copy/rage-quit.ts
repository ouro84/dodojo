import type { AggressivityLevel } from "../../types";

interface RageQuitConfirmArgs {
  taskTitle: string;
  penalty: number;
}

export function rageQuitConfirmBody(level: AggressivityLevel, args: RageQuitConfirmArgs): string {
  const { taskTitle, penalty } = args;
  const lines: Record<AggressivityLevel, string> = {
    sensei: `Abandonner « ${taskTitle} » coûte −${penalty} XP. Une pause consciente, pas un échec — le Boss retrouve un peu de terrain.`,
    sparring: `Abandonner « ${taskTitle} » coûte −${penalty} XP. Le Boss rétrécit, mais il ricanera.`,
    street: `Lâcher « ${taskTitle} », ça pique −${penalty} XP direct. Le Boss va se foutre de ta gueule.`,
  };
  return lines[level];
}

export function rageQuitPunchline(level: AggressivityLevel): string {
  const lines: Record<AggressivityLevel, string> = {
    sensei: "Le Boss hausse les épaules : « Une pause. Reviens quand tu es prêt. »",
    sparring: "Le Boss ricane : « Déjà à terre ? Relève-toi. »",
    street: "Le Boss se marre : « Déjà cuit ? Merde, relève-toi et reviens te battre. »",
  };
  return lines[level];
}
