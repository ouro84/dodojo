import { expect, test, type Page } from "@playwright/test";
import { login, resetAchievementsState, resetProfileForKpi, resetShopState, seedStreak } from "./fixtures";
import { ALL_ACHIEVEMENT_DEFS, type AchievementRarity } from "@/lib/achievements";

// Totaux attendus dérivés du catalogue (robuste aux évolutions de la table).
function expectedTotals(): Record<AchievementRarity, number> {
  const totals: Record<AchievementRarity, number> = {
    bronze: 0,
    argent: 0,
    or: 0,
    platine: 0,
  };
  for (const def of ALL_ACHIEVEMENT_DEFS) totals[def.rarity] += 1;
  return totals;
}

// Cible le compteur d'une rareté dans le KPI par son data-testid.
//
// Issue #199 : la version précédente cherchait le TEXTE "X/Y" en sous-chaîne
// dans la section KPI, en s'appuyant sur le fait que les totaux par rareté
// étaient disjoints (11/6/8/1 à l'époque). Ce lot les a rendus préfixes les uns
// des autres (bronze=20, argent=10, or=11, platine=1) : chercher "0/1" matchait
// alors aussi "0/10" et "0/11" — strict mode violation, sur une assertion qui
// n'avait pourtant rien de faux. Un ancrage structurel ne peut pas repartir en
// vrille au prochain succès ajouté.
function kpiCount(page: Page, rarity: AchievementRarity) {
  return page.getByTestId(`rarity-${rarity}`);
}

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
    // radio du sélecteur de titre contiennent toutes deux "Aube" une fois
    // débloqué. On cible la carte catalogue (un <li>), pas l'option radio.
    await expect(page.locator("li", { hasText: "Aube" })).toBeVisible();

    // Issue #140 : le <select> natif est remplacé par un radiogroup ARIA.
    await page.getByRole("radio", { name: "Aube" }).click();
    await expect(page.getByRole("radio", { name: "Aube" })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("Issue #142 — KPI par rareté", () => {
  test("nouveau profil : 1/total bronze (fire_knight offert), 0 ailleurs", async ({ page }) => {
    await resetAchievementsState();
    // resetShopState remet l'état canonique : fire_knight offert (→ succès
    // HERO_FIRE_KNIGHT bronze débloqué d'office), aucun autre héros ni skin.
    await resetShopState();
    // resetProfileForKpi remet level=1 et best_streak=0 : sinon LEVEL_10/20
    // (bronze) se débloquent sur le level résiduel du compte partagé.
    await resetProfileForKpi();
    // Aucune victoire semée → best_streak=0, pas de FIRST_VICTORY. seedStreak([])
    // purge aussi les day_results hérités d'autres tests (compte partagé ADR-04)
    // — notamment la victory semée par resetShopState.
    await seedStreak([]);

    await login(page);
    // Évaluation déclenchée par resolveDailyBoss au chargement de l'Arène :
    // sans ça, HERO_FIRE_KNIGHT n'est pas encore persisté en base au 1er
    // goto de la page succès. On passe par l'Arène puis on revient.
    await page.goto("/");
    await page.goto("/tableau-de-chasse/succes");

    const totals = expectedTotals();
    // HERO_FIRE_KNIGHT (bronze) est débloqué d'office via resetShopState.
    await expect(kpiCount(page, "bronze")).toHaveText(`1/${totals.bronze}`);
    await expect(kpiCount(page, "argent")).toHaveText(`0/${totals.argent}`);
    await expect(kpiCount(page, "or")).toHaveText(`0/${totals.or}`);
    await expect(kpiCount(page, "platine")).toHaveText(`0/${totals.platine}`);
  });

  test("après une victoire, FIRST_VICTORY (bronze) incrémente le compteur bronze", async ({ page }) => {
    await resetAchievementsState();
    await resetShopState();
    await resetProfileForKpi();
    // FIRST_VICTORY (bronze) se débloque dès la 1re victoire — pas dépendant
    // de l'horloge serveur, déterministe. HERO_FIRE_KNIGHT est déjà bronze.
    await seedStreak([{ day_date: "2020-01-01", outcome: "victory" }]);

    await login(page);
    // Évaluation déclenchée par resolveDailyBoss au chargement de l'Arène.
    await page.goto("/");
    await page.goto("/tableau-de-chasse/succes");

    const totals = expectedTotals();
    // HERO_FIRE_KNIGHT + FIRST_VICTORY + NO_ABANDON_VICTORY → 3 succès bronze.
    // Issue #199 : la victoire semée porte `tasks_abandoned: 0`, elle débloque
    // donc aussi « Sans Bavure ». Attendu, pas une fuite d'état : le succès
    // décrit exactement la journée que ce test met en base.
    await expect(kpiCount(page, "bronze")).toHaveText(`3/${totals.bronze}`);
    await expect(kpiCount(page, "argent")).toHaveText(`0/${totals.argent}`);
    await expect(kpiCount(page, "or")).toHaveText(`0/${totals.or}`);
    await expect(kpiCount(page, "platine")).toHaveText(`0/${totals.platine}`);
  });
});
