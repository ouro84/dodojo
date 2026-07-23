import { describe, expect, test } from "vitest";
import { buildReminderPayload } from "./notifications";

describe("buildReminderPayload — sparring (comportement actuel inchangé)", () => {
  test("titre et deep-link fixes, quel que soit le gabarit tiré", () => {
    const payload = buildReminderPayload(3, "sparring", () => 0);
    expect(payload.title).toBe("Dodojo — Le Boss t'attend");
    expect(payload.url).toBe("/");
  });

  test("accorde au singulier quand il reste 1 tâche", () => {
    const payload = buildReminderPayload(1, "sparring", () => 0);
    expect(payload.body).toContain("1 monstre à");
    expect(payload.body).not.toContain("monstres");
  });

  test("accorde au pluriel quand il reste plusieurs tâches", () => {
    const payload = buildReminderPayload(4, "sparring", () => 0);
    expect(payload.body).toContain("4 monstres à");
  });

  test("pickIndex sélectionne le gabarit correspondant (index 2)", () => {
    const payload = buildReminderPayload(2, "sparring", () => 2);
    expect(payload.body).toContain("Crépuscule approche");
  });

  test("pickIndex hors bornes retombe sur le premier gabarit", () => {
    const payload = buildReminderPayload(5, "sparring", () => 99);
    expect(payload.body).toContain("Le Boss ricane");
  });
});

describe("buildReminderPayload — niveaux", () => {
  test("sensei reste sans juron sur tous les gabarits", () => {
    for (let i = 0; i < 6; i++) {
      const payload = buildReminderPayload(3, "sensei", () => i);
      expect(payload.body).not.toMatch(/putain|bordel|merde|\bcon\b|connard|foutre/);
    }
  });

  test("street élargit le vocabulaire", () => {
    const payload = buildReminderPayload(3, "street", () => 0);
    expect(payload.body).toMatch(/marre/);
  });

  test("6 gabarits disponibles par niveau, tous distincts", () => {
    const bodies = new Set<string>();
    for (let i = 0; i < 6; i++) bodies.add(buildReminderPayload(3, "sparring", () => i).body);
    expect(bodies.size).toBe(6);
  });
});
