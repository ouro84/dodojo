import { describe, expect, test } from "vitest";
import { deadlineAlertLine } from "./deadline";

describe("Attaque Surprise (deadline ratée)", () => {
  test("sparring = texte actuel", () => {
    expect(deadlineAlertLine("sparring", { taskTitle: "Appeler le client", damage: 10 })).toBe(
      "⏰ Attaque Surprise : « Appeler le client » a raté sa deadline (−10 HP).",
    );
  });
  test("sensei reste sans juron, street élargit sans viser le joueur", () => {
    expect(deadlineAlertLine("sensei", { taskTitle: "X", damage: 10 })).not.toMatch(
      /putain|bordel|merde|\bcon\b|connard|foutre/,
    );
    const street = deadlineAlertLine("street", { taskTitle: "X", damage: 10 });
    expect(street).toMatch(/merde/);
    expect(street).not.toMatch(/connard|\bcon\b/);
  });
});
