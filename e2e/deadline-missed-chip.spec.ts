import { test, expect } from "@playwright/test";
import { login, seedMissedDeadlineTask, deleteTaskById } from "./fixtures";

// A4 (issue #101) — Chip "-10 HP" (rouge alerte) sur une TaskRow dont la
// deadline horaire est ratée et non résolue. Disparaît dès résolution.
test.describe("A4 — Chip -10 HP (deadline ratée)", () => {
  test("le chip -10 HP est visible après deadline ratée, puis disparaît à la coche", async ({ page }) => {
    const title = `E2E chip missed ${Date.now()}`;
    const taskId = await seedMissedDeadlineTask(title, { minutesAgo: 5 });
    try {
      await login(page);

      const row = page.locator("li", { hasText: title });
      // Le chip -10 HP a un aria-label explicite pour cibler précisément
      // cette pénalité (dur à confondre avec un autre "-10 HP" futur).
      const chip = row.getByLabel("Pénalité -10 HP : deadline ratée");
      await expect(chip).toBeVisible({ timeout: 10_000 });
      await expect(chip).toHaveText("-10 HP");

      // Cocher la tâche résout la pénalité → le chip disparaît.
      await row.locator('input[type="checkbox"]').check();

      // Attend la résolution (re-render → missedDeadlineIds recalculé → chip retiré).
      await expect(chip).toBeHidden({ timeout: 10_000 });
    } finally {
      await deleteTaskById(taskId);
    }
  });
});
