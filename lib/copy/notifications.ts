import type { AggressivityLevel } from "../../types";

export interface PushReminderPayload {
  title: string;
  body: string;
  url: string;
}

function pluralize(n: number, singular: string, plural: string): string {
  return n <= 1 ? singular : plural;
}

type ReminderTemplate = Record<AggressivityLevel, (n: number) => string>;

const REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    sensei: (n) => `Il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant le Rituel du Crépuscule. À ton rythme.`,
    sparring: (n) =>
      `Le Boss ricane, il te reste ${n} ${pluralize(n, "monstre", "monstres")} à abattre avant le Rituel du Crépuscule !`,
    street: (n) =>
      `Le Boss se marre, il te reste ${n} ${pluralize(n, "monstre", "monstres")} à défoncer avant le Crépuscule, bouge-toi !`,
  },
  {
    sensei: (n) =>
      `Le dojo t'attend, sans te presser : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "patiente", "patientent")} encore.`,
    sparring: (n) =>
      `Le Dojo t'attend : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "tient", "tiennent")} encore debout.`,
    street: (n) =>
      `Le Dojo t'attend, putain : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "tient", "tiennent")} encore debout.`,
  },
  {
    sensei: (n) =>
      `Le Crépuscule approche. ${n} ${pluralize(n, "tâche restante", "tâches restantes")}, quand tu es prêt.`,
    sparring: (n) =>
      `Le Crépuscule approche et ton Boss respire encore (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
    street: (n) =>
      `Le Crépuscule approche et ton Boss respire encore, merde (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
  },
  {
    sensei: (n) =>
      `${n} ${pluralize(n, "point de vie", "points de vie")} encore à récupérer aujourd'hui, si le cœur t'en dit.`,
    sparring: (n) =>
      `Termine-le : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
    street: (n) =>
      `Termine-le, bordel : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
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
