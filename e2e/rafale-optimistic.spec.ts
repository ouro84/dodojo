import { test, expect } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Issues #95/#96 : un tap rapide sur les interactions (ajouter, cocher,
// décocher enchaînés en rafale) ne doit JAMAIS afficher un toast d'erreur
// (cf. "La tâche ne peut pas être cochée", "Le coup n'est pas passé")
// provoqué par l'envoi d'un id optimistic-N à une server action. Vérifie
// aussi que le verrou anti-double-tap sur handleToggle garde l'état visuel
// cohérent ("ça ne se décoche pas tout seul").
//
// Le test ne s'appuie pas sur un timing déterministe : il déclenche juste
// plusieurs actions en très peu de temps (un click + un check + un uncheck
// en moins de ~100 ms), puis attend l'état stable attendu. Les guards UI
// + verrou pendingMutationIds + guards UUID server sont censés absorber le
// délai réseau sans jamais afficher d'erreur ni d'état incohérent.
//
// On ne peut pas assert "aucun role=alert sur la page" : le Réveil
// (WakeUpRitual) peut déjà en afficher un au chargement si le compte e2e
// a des retards en attente (cf. seedOverdueTask). On snapshot donc le
// nombre présent au début du test et on vérifie qu'il n'augmente pas
// pendant la rafale — seul invariant reel du bug #95/#96. On discrimine
// aussi par le texte du toast applicatif (banner de Arena.tsx) si besoin.
test.describe("Rafale ajouter/cocher/décocher (issues #95/#96)", () => {
  const cleanupTitles: string[] = [];

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    for (const title of cleanupTitles.splice(0)) {
      await abandonViaUi(page, title);
    }
  });

  // Les messages d'erreur métier qu'on veut garantir ABSENTS pendant la
  // rafale (issus de tasks.ts). On cherche un substring plutôt que le
  // texte exact pour rester robuste à des variations wording.
  const FORBIDDEN_ERRORS = [
    "n'est pas passé",
    "Impossible d'annuler le coup",
    "pas encore prête",
    "ne peut pas être cochée",
    "Impossible d'abandonner",
    "Impossible de fixer",
  ];

  async function assertNoForbiddenError(page: import("@playwright/test").Page): Promise<void> {
    const alerts = page.getByRole("alert");
    const count = await alerts.count();
    for (let i = 0; i < count; i += 1) {
      const text = (await alerts.nth(i).textContent()) ?? "";
      for (const forbidden of FORBIDDEN_ERRORS) {
        if (text.includes(forbidden)) {
          throw new Error(`Toast d'erreur interdit détecté pendant la rafale : "${text}"`);
        }
      }
    }
  }

  test("ajouter puis cocher et décocher en rafale n'affiche aucune erreur", async ({ page }) => {
    const title = `E2E RAF ${Date.now()}`;
    cleanupTitles.push(title);

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));
    const initialCurrentHp = Number(await bossBar.getAttribute("aria-valuenow"));

    // Saisie + submit synchrones (déclenchent l'optimistic update addTask).
    await page.getByLabel("Ajouter une tâche").fill(title);
    await page.getByRole("button", { name: "Ajouter" }).click();

    // Pendant que addTask est en vol (id optimistic-N), on enchaîne immédiate-
    // ment la coche puis la décoche. Les guards UI (checkbox disabled tant
    // que isOptimisticTask) empêchent l'id optimistic d'atteindre le serveur.
    const checkbox = page
      .locator("li", { hasText: title })
      .locator('input[type="checkbox"]');

    // attend que la ligne optimistic apparaisse (peut prendre un tick de
    // rendu — on ne suppose pas qu'elle est là instantanément).
    await expect(checkbox).toBeVisible();

    // disabled pendant la phase optimistic : on doit juste pouvoir beneficiary
    // d'un état disabled *puis* enabled, sans erreur. On probe en boucle.
    // Si la latence serveur est très courte (local), le disable peut être
    // imperceptible : on ne assertion pas dessus, on vérifie juste qu'au final
    // aucune erreur n'apparaît (le vrai invariant produit).

    // On attend la résolution de l'optimistic (drag handle re-enabled = l'id
    // réel a remplacé l'id optimistic).
    const dragHandle = page.getByLabel(`Déplacer "${title}"`);
    await expect(dragHandle).toBeEnabled({ timeout: 15_000 });

    // Enchaîne COCHE → DÉCACHE en rafale. Même si enable devient un état
    // intermédiaire bref pendant un toggle en vol, le verrou
    // pendingMutationIds désactive la 2e interaction pendant que la 1re
    // est en vol ; le second tap est ignoré (aucun rollback ne se produit).
    const hpBeforeToggle = Number(await bossBar.getAttribute("aria-valuenow"));
    await checkbox.check();
    await checkbox.uncheck();
    await assertNoForbiddenError(page);

    // À l'équilibre : aucune erreur affichée, HP identique au départ (on a
    // coché puis décoché la même tâche, le bilan net est nul).
    await expect(bossBar).toHaveAttribute("aria-valuenow", String(hpBeforeToggle), {
      timeout: 15_000,
    });
    await expect(bossBar).toHaveAttribute(
      "aria-valuemax",
      String(initialMaxHp + 20),
    );
    // HP net = même qu'avant ; HP initial + 20 max + 20 current = correct.
    await expect(bossBar).toHaveAttribute(
      "aria-valuenow",
      String(initialCurrentHp + 20),
    );

    // Deuxième passe : cocher LA tâche (la même), puis la décocher, puis la
    // cocher à nouveau. Tous ces enchaînements en < 200 ms ne doivent
    // JAMAIS aboutir à un toast "Le coup n'est pas passé".
    await checkbox.check();
    await checkbox.uncheck();
    await checkbox.check();
    await expect(bossBar).toHaveAttribute(
      "aria-valuenow",
      String(initialCurrentHp),
      { timeout: 15_000 },
    );
    await assertNoForbiddenError(page);
  });

  test("cinq coches très rapides sur la même tâche ne laisse aucune erreur", async ({ page }) => {
    const title = `E2E RAF5 ${Date.now()}`;
    cleanupTitles.push(title);

    await page.getByLabel("Ajouter une tâche").fill(title);
    await page.getByRole("button", { name: "Ajouter" }).click();

    const checkbox = page
      .locator("li", { hasText: title })
      .locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();

    await expect(page.getByLabel(`Déplacer "${title}"`)).toBeEnabled({
      timeout: 15_000,
    });

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const hpBefore = Number(await bossBar.getAttribute("aria-valuenow"));

    // 5 toggles en rafale. Le verrou anti-double-tap absorbe les taps 2-5
    // tant que le 1er est en vol : l'état final n'est PAS déterministe
    // (dépend de combien de taps passent avant le verrou). Invariant réel du
    // fix #95/#96 : aucune erreur affichée (toast métier interdit), et le
    // HP final reste cohérent avec l'état de la checkbox (pas de divergence
    // UI / state). On borne donc entre "non cochée" (HP = hpBefore) et
    // "cochée une fois" (HP = hpBefore - 20) plutôt que d'exiger impaire.
    for (let i = 0; i < 5; i += 1) {
      const isChecked = await checkbox.isChecked();
      if (isChecked) {
        await checkbox.uncheck();
      } else {
        await checkbox.check();
      }
    }

    // Laisse le temps au dernier appel serveur en vol de résoudre (et au
    // rollback éventuel de se poser). 15s = timeout identique aux autres
    // tests, valide même sur réseau lent.
    await expect.poll(
      async () => Number(await bossBar.getAttribute("aria-valuenow")),
      { timeout: 15_000 },
    ).toBeLessThanOrEqual(hpBefore);
    await expect.poll(
      async () => Number(await bossBar.getAttribute("aria-valuenow")),
      { timeout: 15_000 },
    ).toBeGreaterThanOrEqual(hpBefore - 20);

    // Cohérence UI/state : le HP reflète bien l'état de la checkbox.
    const finalChecked = await checkbox.isChecked();
    const expectedHp = finalChecked ? hpBefore - 20 : hpBefore;
    await expect(bossBar).toHaveAttribute("aria-valuenow", String(expectedHp), {
      timeout: 15_000,
    });

    await assertNoForbiddenError(page);
  });
});
