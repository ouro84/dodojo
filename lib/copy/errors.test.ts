import { describe, expect, test } from "vitest";
import { technicalErrorLine } from "./errors";

const FORBIDDEN_SENSEI = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Erreur technique", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(technicalErrorLine("sparring", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(technicalErrorLine("sparring", 2)).toBe(technicalErrorLine("sparring", 2));
  });

  test("street jure sur tout le pool, sensei jamais", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(technicalErrorLine("street", seed)).toMatch(/putain|bordel|merde/i);
      expect(technicalErrorLine("sensei", seed)).not.toMatch(FORBIDDEN_SENSEI);
    }
  });
});
