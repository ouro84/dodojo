import { describe, expect, test } from "vitest";
import { technicalErrorLine } from "./errors";

describe("Erreur technique", () => {
  test("sparring = texte actuel", () => {
    expect(technicalErrorLine("sparring")).toBe(
      "Connexion coupée avec le dojo. Impossible de récupérer ton combat.",
    );
  });
  test("street jure, sensei jamais", () => {
    expect(technicalErrorLine("street")).toMatch(/putain/i);
    expect(technicalErrorLine("sensei")).not.toMatch(/putain|bordel|merde|\bcon\b|connard|foutre/);
  });
});
