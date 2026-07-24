import { test, expect } from "@playwright/test";
import { login, seedOverdueTask, deleteTaskById, getTaskById } from "./fixtures";

// Le Réveil (US-08) dépend de tâches d'un jour local passé. seedOverdueTask
// (e2e/fixtures.ts) insère directement un reste via le client service_role,
// ce qui débloque enfin la couverture e2e réelle (auparavant un test.fixme,
// cf. historique git — la dette e2e est soldée par bug #70).
test.describe("Rituel du Réveil (US-08)", () => {
  test("Reporter fait réapparaître la tâche dans la liste du jour (bug #70)", async ({ page }) => {
    const title = `E2E reste reporter ${Date.now()}`;
    const taskId = await seedOverdueTask(title);
    try {
      await login(page);

      const ritual = page.getByRole("alertdialog", { name: "Rituel du Réveil" });
      await expect(ritual).toBeVisible();
      await expect(ritual.getByText(title)).toBeVisible();

      // Bug #70 : avant le fix, la tâche reportée disparaissait de l'Arène
      // (state client jamais mis à jour) - même effet visible qu'Annihiler.
      await ritual.getByLabel(`Reporter "${title}"`).click();
      await expect(ritual.getByText(title)).toBeHidden();

      await expect(page.getByText(title)).toBeVisible();
    } finally {
      await deleteTaskById(taskId);
    }
  });

  test("Annihiler abandonne le reste sans jamais le supprimer (RG-04)", async ({ page }) => {
    const title = `E2E reste annihiler ${Date.now()}`;
    const taskId = await seedOverdueTask(title);
    try {
      await login(page);

      const ritual = page.getByRole("alertdialog", { name: "Rituel du Réveil" });
      await expect(ritual).toBeVisible();
      await expect(ritual.getByText(title)).toBeVisible();

      await ritual.getByLabel(`Annihiler "${title}"`).click();
      await expect(ritual.getByText(title)).toBeHidden();

      // Ni dans le Rituel (résolu), ni dans l'Arène...
      await expect(page.getByText(title)).toHaveCount(0);
      // ...mais toujours en base (is_abandoned=true), jamais un DELETE (RG-04).
      await expect
        .poll(() => getTaskById(taskId))
        .toMatchObject({ is_abandoned: true, abandon_reason: "annihilated" });
    } finally {
      await deleteTaskById(taskId);
    }
  });
});
