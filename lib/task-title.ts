// Contrainte partagée par le formulaire d'ajout in-app (AddTaskForm.tsx,
// SubtaskForm.tsx, maxLength=140, contrôle HTML uniquement) et toute entrée
// non-UI (US-03 webhook Siri, futur US-22 MCP Gemini) — une seule source de
// vérité pour la validation SERVEUR, jamais réinventée par appelant.
export const TASK_TITLE_MAX_LENGTH = 140;

export type TaskTitleValidation = { title: string } | { error: string };

export function validateTaskTitle(rawTitle: string): TaskTitleValidation {
  const title = rawTitle.trim();
  if (!title) {
    return { error: "Nomme ton monstre avant de l'invoquer." };
  }
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    return { error: `Le nom du monstre est trop long (${TASK_TITLE_MAX_LENGTH} caractères max).` };
  }
  return { title };
}
