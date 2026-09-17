import { test, expect } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Scénario US-02 : dicter une tâche via le bouton micro la crée automatiquement.
// L'API Web Speech est simulée via addInitScript (pas de micro réel en CI).
test.describe("Bouton Micro In-App (US-02)", () => {
  let dictatedTitle: string | undefined;

  test.afterEach(async ({ page }) => {
    // RG-04 : jamais de suppression — on abandonne la tâche créée par le test.
    if (!dictatedTitle) return;
    await abandonViaUi(page, dictatedTitle);
    dictatedTitle = undefined;
  });

  test("cliquer sur le micro dicte et crée automatiquement la tâche", async ({ page }) => {
    dictatedTitle = `E2E vocal ${Date.now()}`;

    await page.addInitScript((transcript) => {
      class FakeSpeechRecognition extends EventTarget {
        lang = "";
        continuous = false;
        interimResults = false;
        maxAlternatives = 1;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          const result = Object.assign([{ transcript }], { isFinal: true });
          const fakeEvent = { results: [result] };
          queueMicrotask(() => this.onresult?.(fakeEvent));
        }
        stop() {}
        abort() {}
      }
      window.SpeechRecognition = FakeSpeechRecognition;
    }, dictatedTitle);

    await login(page);

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));

    await page.getByLabel("Dicter une tâche").click();

    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 20));
    await expect(page.locator("li", { hasText: dictatedTitle })).toBeVisible();
  });

  test("navigateur non supporté : le bouton micro est absent", async ({ page }) => {
    await page.addInitScript(() => {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    });

    await login(page);

    await expect(page.getByLabel("Dicter une tâche")).toHaveCount(0);
  });
});
