import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildAdditionalPrecacheEntries } from "./precache-entries";

// Régression #102 : ajouter ici une URL déjà référencée via un `url(...)`
// dans app/globals.css (donc déjà auto-précachée avec un hash de contenu
// par le pipeline de build) crée une entrée en double avec une révision
// différente. Workbox lève "add-to-cache-list-conflicting-entries" à
// l'évaluation du script, ce qui empêche l'installation du service worker
// pour tout le monde, en silence — c'était la cause racine de #102 depuis
// b2506a1 (mise en place initiale de la PWA), sans rapport avec la
// migration push/Inngest.
test("aucune entrée d'additionalPrecacheEntries n'est aussi référencée via url(...) dans globals.css (régression #102)", () => {
  const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");
  const entries = buildAdditionalPrecacheEntries("test-revision");

  for (const entry of entries) {
    expect(globalsCss.includes(`url("${entry.url}")`)).toBe(false);
  }
});

describe("buildAdditionalPrecacheEntries", () => {
  test("porte la même révision sur toutes les entrées", () => {
    const entries = buildAdditionalPrecacheEntries("abc123");
    expect(entries.every((e) => e.revision === "abc123")).toBe(true);
  });
});
