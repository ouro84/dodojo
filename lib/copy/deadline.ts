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

export interface DeadlineReminderPayload {
  title: string;
  body: string;
  url: string;
}

// Issue #114 : notif envoyée par lib/inngest/functions/schedule-deadline-reminder.ts
// avant l'échéance d'une deadline (≠ deadlineAlertLine, envoyée APRÈS coup).
export function buildDeadlineReminderPayload(
  taskTitle: string,
  offsetMinutes: number,
  level: AggressivityLevel,
  seed: number = randomSeed(),
): DeadlineReminderPayload {
  if (offsetMinutes === 0) {
    const atTimePools: Record<AggressivityLevel, Array<(t: string) => string>> = {
      doux: [
        (t) => `⏰ « ${t} » arrive à son heure, doucement.`,
        (t) => `⏰ C'est le moment pour « ${t} ».`,
      ],
      direct: [
        (t) => `⏰ « ${t} » : c'est l'heure.`,
        (t) => `⏰ Deadline atteinte pour « ${t} ».`,
      ],
      brut: [
        (t) => `⏰ « ${t} », c'est maintenant, bouge.`,
        (t) => `⏰ L'heure de « ${t} » est là, merde.`,
      ],
    };
    return {
      title: "Dodojo — Deadline qui approche",
      body: pickVariant(atTimePools[level], seed)(taskTitle),
      url: "/",
    };
  }

  const pools: Record<AggressivityLevel, Array<(t: string, n: number) => string>> = {
    doux: [
      (t, n) => `⏰ « ${t} » approche, encore ${n} min.`,
      (t, n) => `⏰ Dans ${n} min, « ${t} » arrive à son heure.`,
      (t, n) => `⏰ « ${t} » : ${n} min avant l'échéance, à ton rythme.`,
      (t, n) => `⏰ Un petit rappel pour « ${t} », ${n} min encore.`,
      (t, n) => `⏰ « ${t} » se rapproche, ${n} min restantes.`,
    ],
    direct: [
      (t, n) => `⏰ « ${t} » arrive dans ${n} min.`,
      (t, n) => `⏰ Rappel : ${n} min avant « ${t} ».`,
      (t, n) => `⏰ « ${t} » : deadline dans ${n} min.`,
      (t, n) => `⏰ Plus que ${n} min pour « ${t} ».`,
      (t, n) => `⏰ « ${t} » approche à grands pas (${n} min).`,
    ],
    brut: [
      (t, n) => `⏰ « ${t} », ${n} min et c'est fini, bouge.`,
      (t, n) => `⏰ ${n} min avant « ${t} », grouille.`,
      (t, n) => `⏰ « ${t} » te tombe dessus dans ${n} min.`,
      (t, n) => `⏰ Yo, ${n} min avant « ${t} », merde.`,
      (t, n) => `⏰ « ${t} » : ${n} min, magne-toi.`,
    ],
  };

  return {
    title: "Dodojo — Deadline qui approche",
    body: pickVariant(pools[level], seed)(taskTitle, offsetMinutes),
    url: "/",
  };
}
