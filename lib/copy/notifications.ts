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

function pluralize(n: number, singular: string, plural: string): string {
  return n <= 1 ? singular : plural;
}

type ReminderTemplate = Record<AggressivityLevel, (n: number) => string>;

const REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    doux: (n) => `Il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant la fin de la journée. À ton rythme.`,
    direct: (n) =>
      `Le Boss ricane, il te reste ${n} ${pluralize(n, "monstre", "monstres")} à abattre avant ce soir !`,
    brut: (n) =>
      `Le Boss se marre, il te reste ${n} ${pluralize(n, "monstre", "monstres")} à défoncer avant ce soir, bouge-toi !`,
  },
  {
    doux: (n) =>
      `Ta tête t'attend, sans te presser : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "patiente", "patientent")} encore.`,
    direct: (n) =>
      `Ta tête t'attend : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "tient", "tiennent")} encore debout.`,
    brut: (n) =>
      `Ta tête t'attend, putain : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "tient", "tiennent")} encore debout.`,
  },
  {
    doux: (n) =>
      `La journée s'achève. ${n} ${pluralize(n, "tâche restante", "tâches restantes")}, quand tu es prêt.`,
    direct: (n) =>
      `La journée s'achève et ton Boss respire encore (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
    brut: (n) =>
      `La journée s'achève et ton Boss respire encore, merde (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
  },
  {
    doux: (n) =>
      `${n} ${pluralize(n, "point de vie", "points de vie")} encore à récupérer aujourd'hui, si le cœur t'en dit.`,
    direct: (n) =>
      `Termine-le : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
    brut: (n) =>
      `Termine-le, bordel : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
  },
  {
    doux: (n) =>
      `Une petite pensée pour ${n} ${pluralize(n, "tâche", "tâches")} qui patiente${n <= 1 ? "" : "nt"} encore aujourd'hui.`,
    direct: (n) =>
      `Petit rappel : ${n} ${pluralize(n, "tâche", "tâches")} encore debout${n <= 1 ? "e" : "s"} avant ce soir.`,
    brut: (n) =>
      `Yo, rappel : ${n} ${pluralize(n, "tâche", "tâches")} encore debout${n <= 1 ? "e" : "s"}, bouge ton cul.`,
  },
  {
    doux: (n) =>
      `La fin de journée approche doucement. ${n} ${pluralize(n, "tâche", "tâches")} attend${n <= 1 ? "" : "ent"} ta décision.`,
    direct: (n) =>
      `La fin de journée approche à grands pas : ${n} ${pluralize(n, "tâche", "tâches")} encore en jeu.`,
    brut: (n) =>
      `La journée se ferme, merde : ${n} ${pluralize(n, "tâche", "tâches")} encore en jeu. Grouille.`,
  },
];

export function buildReminderPayload(
  remainingTasks: number,
  level: AggressivityLevel,
  pickIndex: (templateCount: number) => number = (count) => Math.floor(Math.random() * count),
): PushReminderPayload {
  const index = pickIndex(REMINDER_TEMPLATES.length);
  const template = REMINDER_TEMPLATES[index] ?? REMINDER_TEMPLATES[0];
  return {
    title: "Dodojo — Le Boss t'attend",
    body: template[level](remainingTasks),
    url: "/",
  };
}
