// US-11 : contenu des notifications de rappel — ton "combat de rue" déjà
// établi ailleurs (combo, rage quit, Perfect/K.O.), pas une formule fixe.
// Module pur, même logique que lib/bosses.ts / lib/heroes.ts : pas mêlé à
// lib/game-engine.ts (réservé aux calculs RG-01/02).

export interface PushReminderPayload {
  title: string;
  body: string;
  url: string;
}

function pluralize(n: number, singular: string, plural: string): string {
  return n <= 1 ? singular : plural;
}

// Gabarits paramétrés par le nombre de tâches restantes. "Crépuscule" =
// renommage de l'ex-"Obi-Wan" (Rituel du Crépuscule, US-07).
const REMINDER_TEMPLATES: Array<(n: number) => string> = [
  (n) =>
    `Le Boss ricane, il te reste ${n} ${pluralize(n, "monstre", "monstres")} à abattre avant le Rituel du Crépuscule !`,
  (n) =>
    `Le Dojo t'attend : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "tient", "tiennent")} encore debout.`,
  (n) =>
    `Le Crépuscule approche et ton Boss respire encore (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
  (n) =>
    `Termine-le : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
];

// Tire un gabarit (aléatoire par défaut, injectable pour les tests) et
// injecte le nombre de tâches restantes. `url: "/"` = deep-link vers
// l'Arène, interprété par le listener notificationclick du service worker.
export function buildReminderPayload(
  remainingTasks: number,
  pickIndex: (templateCount: number) => number = (count) => Math.floor(Math.random() * count),
): PushReminderPayload {
  const index = pickIndex(REMINDER_TEMPLATES.length);
  const template = REMINDER_TEMPLATES[index] ?? REMINDER_TEMPLATES[0];
  return {
    title: "Dodojo — Le Boss t'attend",
    body: template(remainingTasks),
    url: "/",
  };
}
