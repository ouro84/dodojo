import { expect, test } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Seul spec qui laisse les animations actives : partout ailleurs la config
// force prefers-reduced-motion (cf. playwright.config.ts).
test.use({ contextOptions: { reducedMotion: "no-preference" } });

test.describe("Animations de combat (issue #48)", () => {
  let bufferTitle: string | undefined;
  let taskTitle: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (taskTitle) await abandonViaUi(page, taskTitle);
    if (bufferTitle) await abandonViaUi(page, bufferTitle);
    taskTitle = undefined;
    bufferTitle = undefined;
  });

  test("le héros attaque, le Boss encaisse, puis les deux reviennent à l'idle", async ({ page }) => {
    // Tampon laissé non coché : garantit que le Boss a au moins 20 HP de
    // marge avant le coup testé, pour ne jamais déclencher un K.O. (state
    // "death") sur le compte e2e fixe partagé, dont le HP courant varie
    // selon les specs précédents de la suite.
    bufferTitle = `E2E anim buffer ${Date.now()}`;
    await page.getByLabel("Ajouter une tâche").fill(bufferTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.waitForTimeout(300);

    taskTitle = `E2E anim ${Date.now()}`;

    const hero = page.getByTestId("character-sprite").first();
    const boss = page.getByTestId("character-sprite").last();
    await expect(hero).toHaveAttribute("data-anim-state", "idle");

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.getByLabel(`Marquer "${taskTitle}" comme accomplie`).check();

    await expect(hero).toHaveAttribute("data-anim-state", "attack");
    await expect(boss).toHaveAttribute("data-anim-state", "hurt");
    await expect(hero).toHaveAttribute("data-anim-state", "idle", { timeout: 3000 });
    await expect(boss).toHaveAttribute("data-anim-state", "idle", { timeout: 3000 });
  });

  // Issue #149 (suite de #146) : décocher une tâche déjà complétée doit jouer
  // une contre-attaque du Boss (héros en "hurt"), jamais une attaque du héros
  // — le héros n'attaque qu'en complétant une tâche, pas en l'annulant.
  test("décocher une tâche fait contre-attaquer le Boss (héros hurt, jamais attack)", async ({
    page,
  }) => {
    bufferTitle = `E2E anim buffer uncheck ${Date.now()}`;
    await page.getByLabel("Ajouter une tâche").fill(bufferTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.waitForTimeout(300);

    taskTitle = `E2E anim uncheck ${Date.now()}`;
    const hero = page.getByTestId("character-sprite").first();
    const boss = page.getByTestId("character-sprite").last();

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    const checkbox = page.locator("li", { hasText: taskTitle }).locator('input[type="checkbox"]');
    await checkbox.check();
    await expect(hero).toHaveAttribute("data-anim-state", "idle", { timeout: 3000 });
    await expect(boss).toHaveAttribute("data-anim-state", "idle", { timeout: 3000 });
    // Attend la résolution serveur de la coche (pas seulement la retombée
    // d'anim) avant de décocher — sinon le verrou anti-double-tap (fix #95,
    // pendingMutationIds) ignore silencieusement le décochage pendant que le
    // premier appel est encore en vol.
    await expect(page.getByLabel(`Déplacer "${taskTitle}"`)).toBeEnabled({ timeout: 15_000 });

    await checkbox.uncheck();

    await expect(boss).toHaveAttribute("data-anim-state", "attack");
    await expect(hero).toHaveAttribute("data-anim-state", "hurt");
    await expect(hero).toHaveAttribute("data-anim-state", "idle", { timeout: 3000 });
    await expect(boss).toHaveAttribute("data-anim-state", "idle", { timeout: 3000 });
  });

  // Issue #156 : les VFX d'impact par héros sont remplacés par un flash blanc
  // sur le personnage touché (filter: brightness(0) invert(1) sur un noeud
  // dédié, cf. CharacterSprite.tsx). Le flash s'active pendant "hurt" et
  // disparaît une fois l'anim terminée, exactement comme data-anim-state.
  test("le Boss flashe en blanc quand il encaisse", async ({ page }) => {
    bufferTitle = `E2E anim buffer flash ${Date.now()}`;
    await page.getByLabel("Ajouter une tâche").fill(bufferTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.waitForTimeout(300);

    taskTitle = `E2E flash ${Date.now()}`;
    const bossFlash = page.getByTestId("character-flash").last();

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText(taskTitle)).toBeVisible();

    await expect(bossFlash).not.toHaveClass(/white-flash/);
    await page.getByLabel(`Marquer "${taskTitle}" comme accomplie`).check();
    await expect(bossFlash).toHaveClass(/white-flash/, { timeout: 3000 });
    await expect(bossFlash).not.toHaveClass(/white-flash/, { timeout: 3000 });
  });
});
