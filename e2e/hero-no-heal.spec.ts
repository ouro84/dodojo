import { test, expect } from "@playwright/test";
import { login, seedMissedDeadlineTask, deleteTaskById } from "./fixtures";

// Suppression du système de heal du Héros : cocher une tâche qui portait déjà
// une pénalité active (deadline ratée) ne doit plus faire remonter heroHp.
// Ancien comportement (issue #101, A3) : le pool HP était recalculé en
// direct depuis les tâches non résolues, donc résoudre la pénalité la
// faisait disparaître du calcul → HP remontait ("heal"). Le poids est
// désormais verrouillé côté serveur (tasks.hp_penalty) à la résolution.
test.describe("Suppression du heal Héros — une pénalité résolue reste acquise", () => {
  test("cocher une tâche en deadline ratée ne fait pas remonter heroHp", async ({ page }) => {
    const title = `E2E no heal ${Date.now()}`;
    const taskId = await seedMissedDeadlineTask(title, { minutesAgo: 5 });
    try {
      await login(page);

      const heroBar = page.getByRole("progressbar", { name: /Vie du héros/ });
      // Au 1er rendu : heroHp = 100 - 10 = 90 (1 deadline ratée active).
      await expect(heroBar).toHaveAttribute("aria-valuenow", "90", { timeout: 10_000 });

      const row = page.locator("li", { hasText: title });
      const checkbox = row.locator('input[type="checkbox"]');
      await expect(checkbox).toBeVisible();

      // Coche → la pénalité sort du pool live, mais son poids est verrouillé
      // (hp_penalty) : heroHp doit rester à 90, pas remonter à 100.
      await checkbox.check();

      // Laisse le temps à l'optimistic UI + la réponse serveur de se stabiliser
      // (pas de FloatingText "heal" à attendre — supprimé avec la mécanique).
      await page.waitForTimeout(500);
      await expect(heroBar).toHaveAttribute("aria-valuenow", "90", { timeout: 10_000 });

      // Un rechargement complet doit lire le même état verrouillé depuis la
      // base (hp_penalty persisté), pas seulement tenir en mémoire côté client.
      await page.reload();
      await expect(heroBar).toHaveAttribute("aria-valuenow", "90", { timeout: 10_000 });
    } finally {
      await deleteTaskById(taskId);
    }
  });
});
