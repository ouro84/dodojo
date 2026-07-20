import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// Le Réveil (US-08) dépend de tâches d'un jour local passé. Le compte e2e
// fixe (ADR-04) ne permet pas de voyager dans le temps sans route de seed
// dédiée. Tant qu'elle n'existe pas, on documente le scénario et la couverture
// repose sur les tests unitaires planWakeUp/summarizeDay (lib/game-engine) +
// vérification manuelle. Ne pas supprimer : ce fichier acte la dette e2e.
test.describe("Rituel du Réveil (US-08)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.fixme(
    "overlay bloquant : Reporter re-soigne le Boss, Annihiler abandonne (jamais DELETE)",
    async ({ page }) => {
      // Prérequis : seedOverdueTask (route de test à implémenter avec l'infra e2e).
      const ritual = page.getByRole("alertdialog", { name: "Rituel du Réveil" });
      await expect(ritual).toBeVisible();
      // Reporter : la tâche revient au jour J et le Boss est soigné (RG-02).
      // Annihiler : la tâche disparaît de la liste mais reste en base (is_abandoned, RG-04).
    },
  );
});
