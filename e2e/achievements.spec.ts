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

// Cible le compteur d'une rareté dans le KPI. Le rendu est :
//   <span>
//     <span aria-hidden="true">🥉</span> 1/11
//   </span>
// Plutôt que de filtrer par l'icone (qui matcherait le span enfant), on
// cible directement le texte "<unlocked>/<total>" : les totaux par rareté
// étant distincts (bronze=11, argent=6, or=8, platine=1 dans le catalogue
// courant), ce texte est unique dans la section KPI. La fonction reçoit
// la valeur attendue complète "X/Y" pour ancrer l'assertion.
function kpiCount(page: Page, value: string) {
  // `exact: false` (défaut) : matche le nœud texte " 1/11" à l'intérieur du
  // <span> parent, peu importe l'icone. Les totaux par rareté étant disjoints
  // (11/6/8/1 dans le catalogue courant), la valeur "X/Y" est unique dans la
  // section KPI.
  return page.getByLabel("Avancée par rareté").getByText(value, { exact: false });
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
    // du <select> de titre contiennent toutes deux "Aube" une fois débloqué.
    // On cible la carte catalogue (un <li>), pas l'option du sélecteur.
    await expect(page.locator("li", { hasText: "Aube" })).toBeVisible();

    await page.getByRole("combobox").selectOption("FIRST_VICTORY");
    await expect(page.getByRole("combobox")).toHaveValue("FIRST_VICTORY");
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
    await expect(kpiCount(page, `1/${totals.bronze}`)).toBeVisible();
    await expect(kpiCount(page, `0/${totals.argent}`)).toBeVisible();
    await expect(kpiCount(page, `0/${totals.or}`)).toBeVisible();
    await expect(kpiCount(page, `0/${totals.platine}`)).toBeVisible();
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
    // HERO_FIRE_KNIGHT + FIRST_VICTORY → 2 succès bronze.
    await expect(kpiCount(page, `2/${totals.bronze}`)).toBeVisible();
    await expect(kpiCount(page, `0/${totals.argent}`)).toBeVisible();
    await expect(kpiCount(page, `0/${totals.or}`)).toBeVisible();
    await expect(kpiCount(page, `0/${totals.platine}`)).toBeVisible();
  });
});
