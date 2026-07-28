import { test, expect } from "@playwright/test";
import { login, seedOverdueTask, deleteTaskById } from "./fixtures";

// A4 (issue #101) — Chip "-20 HP" sur une TaskRow en reste reporté (depuis
// Le Réveil). Scénario : seedOverdueTask (day_date dans le passé) → login →
// Réveil bloquant → "Reporter" ramène la tâche au jour courant en Arène
// avec le chip -20 HP visible. Cocher → résolution → chip retiré.
test.describe("A4 — Chip -20 HP (reste reporté)", () => {
  test("Reporter un reste au Réveil affiche le chip -20 HP sur la tâche en Arène", async ({ page }) => {
    const title = `E2E chip overdue ${Date.now()}`;
    const taskId = await seedOverdueTask(title);
    try {
      await login(page);

      const ritual = page.getByRole("alertdialog", { name: "Le Réveil" });
      await expect(ritual).toBeVisible();
      await ritual.getByLabel(`Reporter "${title}"`).click();
      await expect(ritual).toBeHidden();

      // La tâche est revenue dans l'Arène, marquée comme reste reporté → chip -20 HP.
      const row = page.locator("li", { hasText: title });
      const chip = row.getByLabel("Pénalité -20 HP : reste reporté");
      await expect(chip).toBeVisible({ timeout: 10_000 });
      await expect(chip).toHaveText("-20 HP");

      // Cocher la tâche résout la pénalité → le chip disparaît.
      await row.locator('input[type="checkbox"]').check();
      await expect(chip).toBeHidden({ timeout: 10_000 });
    } finally {
      await deleteTaskById(taskId);
    }
  });
});
