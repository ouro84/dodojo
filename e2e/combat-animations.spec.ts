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

    // `hurt` ne dure que 350 ms (HURT_DURATION_MS) et ne démarre qu'à la frame
    // d'impact de l'attaque du Boss (~40 % d'une anim de 600-800 ms). Un
    // `expect(...).toHaveAttribute("hurt")` ne peut pas garantir de voir cette
    // fenêtre : l'intervalle de poll de Playwright recule (100 ms → 250 → 500 →
    // 1000 ms), donc passé la première seconde un poll sur deux tombe à côté
    // d'un état qui n'apparaît qu'une fois. Flake reproduit en CI (run
    // 30768754776 : 14 résolutions consécutives à "idle") ET en local en mode
    // CI (33 résolutions à "idle" sur 15 s) — allonger le timeout n'y change
    // rien, ce n'est pas un problème de marge mais d'échantillonnage.
    //
    // On enregistre donc la SUITE des états traversés, en échantillonnant à
    // chaque frame (~16 ms) : 350 ms font une vingtaine de frames, la fenêtre
    // ne peut plus être ratée, et l'assertion porte sur l'historique plutôt que
    // sur un instantané.
    //
    // Pourquoi un rAF et pas un MutationObserver posé sur les deux sprites
    // (première tentative, invalidée par l'expérience) : `Arena.tsx` re-keye
    // tout le bloc qui contient `VersusScene`
    // (`key={pulse ? \`fx-${pulse.key}\` : "fx-idle"}`) et décocher change les
    // HP, donc `pulse` — React remonte la scène entière au moment même du
    // déclencheur, les nœuds observés sont détachés et l'observateur devient
    // orphelin. Il ne remontait alors AUCUNE transition, ni pour le héros ni
    // pour le Boss (`{heroHurt: false, bossAttack: false}`) : un faux négatif
    // qu'on aurait pu lire à tort comme « la contre-attaque n'a pas lieu ».
    // Le rAF re-résout les nœuds à chaque frame, donc il survit au remontage.
    await page.evaluate(() => {
      const store: Record<string, string[]> = { hero: [], boss: [] };
      (window as unknown as { __animLog: Record<string, string[]> }).__animLog = store;
      const deadline = performance.now() + 15_000;
      const sample = () => {
        const nodes = document.querySelectorAll('[data-testid="character-sprite"]');
        (["hero", "boss"] as const).forEach((key, index) => {
          const value = nodes[index]?.getAttribute("data-anim-state") ?? "";
          const log = store[key];
          if (value && log[log.length - 1] !== value) log.push(value);
        });
        if (performance.now() < deadline) requestAnimationFrame(sample);
      };
      sample();
    });

    await checkbox.uncheck();

    const readLog = () =>
      page.evaluate(
        () => (window as unknown as { __animLog: Record<string, string[]> }).__animLog,
      );
    await expect
      .poll(
        async () => {
          const seen = await readLog();
          return { heroHurt: seen.hero.includes("hurt"), bossAttack: seen.boss.includes("attack") };
        },
        { timeout: 10_000 },
      )
      .toEqual({ heroHurt: true, bossAttack: true });

    // Le « jamais attack » du titre devient une vraie assertion : jusqu'ici il
    // n'était que déduit du fait que le héros passait par "hurt".
    const log = await readLog();
    expect(log.hero, "le héros ne doit jamais attaquer sur un décochage").not.toContain("attack");

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
