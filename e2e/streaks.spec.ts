import { expect, test } from "@playwright/test";
import { login, seedStreak } from "./fixtures";

// US-12 : Le Vestiaire expose la série + le record. La valeur exacte dépend
// du `today` serveur au run ; on vérifie la présence du compteur/record
// (robuste au temps).
test.describe("US-12 Streaks", () => {
  test("Le Vestiaire affiche la série et le record", async ({ page }) => {
    await seedStreak([
      { day_date: "2026-07-20", outcome: "victory" },
      { day_date: "2026-07-19", outcome: "victory" },
    ]);
    await login(page);
    await page.goto("/vestiaire");
    await expect(page.getByText(/Série :/)).toBeVisible();
    await expect(page.getByText(/Record :/)).toBeVisible();
  });
});
