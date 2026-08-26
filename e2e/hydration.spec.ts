import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

// Issue #194 : une erreur d'hydratation React fait re-générer tout l'arbre
// client (coût réel) et, surtout, annule le replay des évènements discrets
// capturés pendant l'hydratation — un clic parti juste après l'affichage est
// alors perdu, silencieusement. C'est la cause du rouge déterministe de
// `volume-interieur.spec.ts`.
//
// Ce spec verrouille l'invariant sur les deux écrans qui portaient un
// mismatch réel : `/vestiaire/profil` (PushReminderToggle lisait
// `Notification` pendant le SSR) et `/` (MidnightTimer formatait l'heure
// restante avec l'horloge/le fuseau du serveur).
const HYDRATION_SIGNATURE = /Hydration failed|didn't match|did not match|Minified React error #(418|419|422|423|425)/i;

const SCREENS: Array<{ path: string; name: string }> = [
  { path: "/vestiaire/profil", name: "Le Profil" },
  { path: "/", name: "l'Arène" },
];

for (const screen of SCREENS) {
  test(`aucune erreur d'hydratation sur ${screen.name} (issue #194)`, async ({ page }) => {
    const errors: string[] = [];
    const collect = (message: string) => {
      if (HYDRATION_SIGNATURE.test(message)) errors.push(message.split("\n")[0]);
    };
    page.on("pageerror", (e) => collect(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") collect(m.text());
    });

    await login(page);
    await page.goto(screen.path);
    // Laisse l'hydratation se terminer : l'erreur est levée pendant, pas au
    // premier paint.
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toBeVisible();

    expect(errors).toEqual([]);
  });
}
