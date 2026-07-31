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
});
