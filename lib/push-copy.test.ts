import { describe, expect, test } from "vitest";
import { buildReminderPayload } from "./push-copy";

describe("buildReminderPayload (US-11 — gabarits de rappel push)", () => {
  test("titre et deep-link fixes, quel que soit le gabarit tiré", () => {
    const payload = buildReminderPayload(3, () => 0);
    expect(payload.title).toBe("Dodojo — Le Boss t'attend");
    expect(payload.url).toBe("/");
  });

  test("accorde au singulier quand il reste 1 tâche", () => {
    const payload = buildReminderPayload(1, () => 0);
    expect(payload.body).toContain("1 monstre à");
    expect(payload.body).not.toContain("monstres");
  });

  test("accorde au pluriel quand il reste plusieurs tâches", () => {
    const payload = buildReminderPayload(4, () => 0);
    expect(payload.body).toContain("4 monstres à");
  });

  test("pickIndex sélectionne le gabarit correspondant (index 2)", () => {
    const payload = buildReminderPayload(2, () => 2);
    expect(payload.body).toContain("Crépuscule approche");
  });

  test("pickIndex hors bornes retombe sur le premier gabarit", () => {
    const payload = buildReminderPayload(5, () => 99);
    expect(payload.body).toContain("Le Boss ricane");
  });
});
