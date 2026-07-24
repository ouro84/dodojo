import { describe, expect, test } from "vitest";
import { resolveAggressivityLevel } from "./aggressivity";

describe("resolveAggressivityLevel", () => {
  test("renvoie la valeur telle quelle si elle est définie", () => {
    expect(resolveAggressivityLevel("doux")).toBe("doux");
    expect(resolveAggressivityLevel("direct")).toBe("direct");
    expect(resolveAggressivityLevel("brut")).toBe("brut");
  });

  test("replie sur direct si null (profil pré-migration US-49/US-54)", () => {
    expect(resolveAggressivityLevel(null)).toBe("direct");
  });

  test("replie sur direct si undefined", () => {
    expect(resolveAggressivityLevel(undefined)).toBe("direct");
  });
});
