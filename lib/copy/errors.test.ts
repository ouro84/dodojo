import { describe, expect, test } from "vitest";
import { technicalErrorLine } from "./errors";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Erreur technique", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(technicalErrorLine("direct", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(technicalErrorLine("direct", 2)).toBe(technicalErrorLine("direct", 2));
  });

  test("brut jure sur tout le pool, doux jamais", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(technicalErrorLine("brut", seed)).toMatch(/putain|bordel|merde/i);
      expect(technicalErrorLine("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });
});
