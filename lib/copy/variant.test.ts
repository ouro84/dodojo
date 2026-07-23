import { describe, expect, test } from "vitest";
import { pickVariant } from "./variant";

describe("pickVariant", () => {
  const pool = ["a", "b", "c", "d", "e"];

  test("indexe modulo la taille du pool", () => {
    expect(pickVariant(pool, 0)).toBe("a");
    expect(pickVariant(pool, 4)).toBe("e");
    expect(pickVariant(pool, 5)).toBe("a");
    expect(pickVariant(pool, 12)).toBe("c");
  });

  test("même seed = même résultat (stabilité)", () => {
    expect(pickVariant(pool, 42)).toBe(pickVariant(pool, 42));
  });
});
