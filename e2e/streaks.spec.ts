import { expect, test } from "@playwright/test";
import { getDayResultOutcome, login, seedStreak, seedWonPastDayWithoutResult } from "./fixtures";

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

  test("un jour gagné mais jamais clôturé n'est pas compté comme joker (issue #160)", async ({ page }) => {
    // Le compte e2e partagé accumule des day_results d'autres specs (RG-04 :
    // pas de DELETE applicatif, mais le client admin bypass RLS) — semaine
    // propre requise avant d'asserter "aucun joker consommé".
    await seedStreak([]);
    const dayDate = await seedWonPastDayWithoutResult(2);
    expect(await getDayResultOutcome(dayDate)).toBeNull(); // trou confirmé avant le chargement

    await login(page);
    // "/" a un loading.tsx (streaming) : waitForURL peut résoudre sur le
    // skeleton avant que le Server Component (donc backfillMissedDays) ait
    // fini son travail — attendre un élément réel de l'Arène avant de lire
    // la DB.
    await expect(page.getByLabel("Ajouter une tâche")).toBeVisible();

    expect(await getDayResultOutcome(dayDate)).toBe("victory");

    await page.goto("/vestiaire");
    await expect(page.getByText(/jokers de la semaine épuisés/)).toHaveCount(0);
  });
});
