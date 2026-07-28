import { test, expect } from "@playwright/test";
import { login, seedMissedDeadlineTask, deleteTaskById } from "./fixtures";

// A3 (issue #101) — FloatingText "+X HP" gold côté Héros à chaque remontée
// de heroHp. On seed une tâche avec deadline déjà dépassée (mock now via
// insertion directe en base, cf. fixtures.seedMissedDeadlineTask) pour que
// missedDeadlineTasks la détecte dès le 1er rendu (pénalité -10 HP active).
// Au login, le Réveil peut se déclencher s'il existe des restes en base ;
// mais une tâche missed deadline du jour n'est pas un reste → pas de Réveil.
// On coche la tâche → heroHp remonte → FloatingText "+X HP" gold visible.
test.describe("A3 — FloatingText heal à la remontée de heroHp", () => {
  test("cocher une tâche en deadline ratée affiche un FloatingText +10 HP gold", async ({ page }) => {
    const title = `E2E heal pulse ${Date.now()}`;
    const taskId = await seedMissedDeadlineTask(title, { minutesAgo: 5 });
    try {
      await login(page);

      const heroBar = page.getByRole("progressbar", { name: /Vie du héros/ });
      // Au 1er rendu : heroHp = 100 - 10 = 90 (1 deadline ratée active).
      await expect(heroBar).toHaveAttribute("aria-valuenow", "90", { timeout: 10_000 });

      const row = page.locator("li", { hasText: title });
      const checkbox = row.locator('input[type="checkbox"]');
      await expect(checkbox).toBeVisible();

      // Coche → résolution de la pénalité → heroHp remonte à 100 → pulse heal.
      await checkbox.check();

      // A3 : le FloatingText "+X HP" gold apparaît au-dessus du Héros (anchor=hero)
      // via la classe floating-text. On vérifie le texte "+10 HP" avec la couleur
      // gold (text-gold, classe dédiée de FloatingText.tsx pour kind="heal").
      const healFloat = page.locator(".floating-text.text-gold", { hasText: /\+10\s*HP/ });
      await expect(healFloat).toBeVisible({ timeout: 5_000 });

      // heroHp reflète bien la remontée.
      await expect(heroBar).toHaveAttribute("aria-valuenow", "100", { timeout: 10_000 });
    } finally {
      await deleteTaskById(taskId);
    }
  });
});
