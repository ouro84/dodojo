import { expect, test } from "@playwright/test";
import { login, resetAchievementsState, seedStreak } from "./fixtures";

test.describe("Issue #72 Succès & Titres", () => {
  test("un succès mystère se révèle au déblocage et le titre s'équipe", async ({ page }) => {
    await resetAchievementsState();
    // Une seule victoire, n'importe quelle date : FIRST_VICTORY ne dépend pas
    // de l'horloge serveur (contrairement à un palier de série).
    await seedStreak([{ day_date: "2020-01-01", outcome: "victory" }]);

    await login(page);
    await page.goto("/tableau-de-chasse/succes");
    await expect(page.getByText("???").first()).toBeVisible();

    // Un chargement de l'Arène déclenche resolveDailyBoss, qui réévalue tous
    // les succès (y compris FIRST_VICTORY) — pas seulement boss/décors.
    await page.goto("/");
    await page.goto("/tableau-de-chasse/succes");
    // `getByText("Aube")` seul est ambigu : la carte catalogue ET l'option
    // du <select> de titre contiennent toutes deux "Aube" une fois débloqué.
    // On cible la carte catalogue (un <li>), pas l'option du sélecteur.
    await expect(page.locator("li", { hasText: "Aube" })).toBeVisible();

    await page.getByRole("combobox").selectOption("FIRST_VICTORY");
    await expect(page.getByRole("combobox")).toHaveValue("FIRST_VICTORY");
  });
});
