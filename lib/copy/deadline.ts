import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

interface DeadlineAlertArgs {
  taskTitle: string;
  damage: number;
}

export function deadlineAlertLine(
  level: AggressivityLevel,
  args: DeadlineAlertArgs,
  seed: number = randomSeed(),
): string {
  const { taskTitle, damage } = args;
  const pools: Record<AggressivityLevel, Array<(t: string, d: number) => string>> = {
    doux: [
      (t, d) => `⏰ Le temps a filé : « ${t} » a dépassé son heure (−${d} HP).`,
      (t, d) => `⏰ L'heure de « ${t} » est passée, sans bruit (−${d} HP).`,
      (t, d) => `⏰ « ${t} » n'a pas attendu, le temps non plus (−${d} HP).`,
      (t, d) => `⏰ Le moment de « ${t} » s'est écoulé (−${d} HP).`,
      (t, d) => `⏰ « ${t} » est restée en retrait de l'heure fixée (−${d} HP).`,
    ],
    direct: [
      (t, d) => `⏰ Attaque Surprise : « ${t} » a raté sa deadline (−${d} HP).`,
      (t, d) => `⏰ « ${t} » a filé sans prévenir (−${d} HP).`,
      (t, d) => `⏰ Deadline ratée sur « ${t} » (−${d} HP). Ça arrive.`,
      (t, d) => `⏰ « ${t} » n'a pas tenu l'horaire (−${d} HP).`,
      (t, d) => `⏰ Surprise : « ${t} » a dépassé l'heure fixée (−${d} HP).`,
    ],
    brut: [
      (t, d) => `⏰ Attaque Surprise, merde : « ${t} » a foiré sa deadline (−${d} HP).`,
      (t, d) => `⏰ « ${t} », c'est raté, bordel (−${d} HP).`,
      (t, d) => `⏰ Deadline explosée sur « ${t} », putain (−${d} HP).`,
      (t, d) => `⏰ « ${t} » a pris l'heure dans les dents (−${d} HP).`,
      (t, d) => `⏰ Le chrono a gagné cette manche sur « ${t} », merde (−${d} HP).`,
    ],
  };
  return pickVariant(pools[level], seed)(taskTitle, damage);
}
