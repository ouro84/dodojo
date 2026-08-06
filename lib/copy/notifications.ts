import type { AggressivityLevel } from "../../types";

export interface PushReminderPayload {
  title: string;
  body: string;
  url: string;
  // Issue #114 (amélioration C) : présents uniquement pour un rappel de
  // deadline (jamais pour le rappel quotidien générique) — permet au service
  // worker d'ajouter l'action "snooze15" et de savoir quoi envoyer à la route
  // de snooze.
  taskId?: string;
  userId?: string;
}

// Issue #160 (bug #5) : deux métriques distinctes, jamais mélangées — le
// nombre de tâches restantes et les HP du Boss racontent des choses
// différentes (une tâche à 20 HP de poids "vaut" plus qu'une tâche à 5 HP).
export interface ReminderMetrics {
  remainingTaskCount: number;
  remainingHp: number;
}

function pluralize(n: number, singular: string, plural: string): string {
  return n <= 1 ? singular : plural;
}

type ReminderUnit = "tasks" | "hp";

interface ReminderTemplate {
  unit: ReminderUnit;
  pools: Record<AggressivityLevel, (n: number) => string>;
}

// Un seul Boss par jour (fiction "Le Démon Intérieur", CLAUDE.md) : aucun
// gabarit ne doit personnifier plusieurs monstres/adversaires distincts.
const REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    unit: "tasks",
    pools: {
      doux: (n) => `Il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant la fin de la journée. À ton rythme.`,
      direct: (n) => `Le Boss ricane, il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant ce soir !`,
      brut: (n) => `Le Boss se marre, il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant ce soir, bouge-toi !`,
    },
  },
  {
    unit: "hp",
    pools: {
      doux: (n) =>
        `Ta tête t'attend, sans te presser : le Boss a encore ${n} ${pluralize(n, "point de vie", "points de vie")}.`,
      direct: (n) =>
        `Ta tête t'attend : le Boss tient encore avec ${n} ${pluralize(n, "point de vie", "points de vie")}.`,
      brut: (n) =>
        `Ta tête t'attend, putain : le Boss tient encore avec ${n} ${pluralize(n, "point de vie", "points de vie")}.`,
    },
  },
  {
    unit: "tasks",
    pools: {
      doux: (n) =>
        `La journée s'achève. ${n} ${pluralize(n, "tâche restante", "tâches restantes")}, quand tu es prêt.`,
      direct: (n) =>
        `La journée s'achève et ton Boss respire encore (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
      brut: (n) =>
        `La journée s'achève et ton Boss respire encore, merde (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
    },
  },
  {
    unit: "hp",
    pools: {
      doux: (n) =>
        `${n} ${pluralize(n, "point de vie", "points de vie")} encore à récupérer aujourd'hui, si le cœur t'en dit.`,
      direct: (n) =>
        `Termine-le : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
      brut: (n) =>
        `Termine-le, bordel : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
    },
  },
  {
    unit: "tasks",
    pools: {
      doux: (n) =>
        `Une petite pensée pour ${n} ${pluralize(n, "tâche", "tâches")} qui patiente${n <= 1 ? "" : "nt"} encore aujourd'hui.`,
      direct: (n) =>
        `Petit rappel : ${n} ${pluralize(n, "tâche", "tâches")} encore debout${n <= 1 ? "e" : "s"} avant ce soir.`,
      brut: (n) => `Yo, rappel : ${n} ${pluralize(n, "tâche", "tâches")} encore debout${n <= 1 ? "e" : "s"}, bouge ton cul.`,
    },
  },
  {
    unit: "tasks",
    pools: {
      doux: (n) =>
        `La fin de journée approche doucement. ${n} ${pluralize(n, "tâche", "tâches")} attend${n <= 1 ? "" : "ent"} ta décision.`,
      direct: (n) =>
        `La fin de journée approche à grands pas : ${n} ${pluralize(n, "tâche", "tâches")} encore en jeu.`,
      brut: (n) => `La journée se ferme, merde : ${n} ${pluralize(n, "tâche", "tâches")} encore en jeu. Grouille.`,
    },
  },
];

export function buildReminderPayload(
  metrics: ReminderMetrics,
  level: AggressivityLevel,
  pickIndex: (templateCount: number) => number = (count) => Math.floor(Math.random() * count),
): PushReminderPayload {
  const index = pickIndex(REMINDER_TEMPLATES.length);
  const template = REMINDER_TEMPLATES[index] ?? REMINDER_TEMPLATES[0];
  const n = template.unit === "hp" ? metrics.remainingHp : metrics.remainingTaskCount;
  return {
    title: "Dodojo — Le Boss t'attend",
    body: template.pools[level](n),
    url: "/",
  };
}
