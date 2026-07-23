import { describe, expect, test } from "vitest";
import { TASK_TITLE_MAX_LENGTH, validateTaskTitle } from "./task-title";

describe("validateTaskTitle (US-01/US-03 — contrainte partagée formulaire + webhook)", () => {
  test("titre valide : trim() et retourné tel quel", () => {
    expect(validateTaskTitle("  Rappeler le client  ")).toEqual({ title: "Rappeler le client" });
  });

  test("titre vide → erreur", () => {
    expect(validateTaskTitle("")).toEqual({ error: "Nomme ton monstre avant de l'invoquer." });
  });

  test("titre uniquement composé d'espaces → erreur", () => {
    expect(validateTaskTitle("   ")).toEqual({ error: "Nomme ton monstre avant de l'invoquer." });
  });

  test("titre exactement à la limite (140 caractères) → valide", () => {
    const title = "x".repeat(TASK_TITLE_MAX_LENGTH);
    expect(validateTaskTitle(title)).toEqual({ title });
  });

  test("titre trop long (141 caractères) → erreur", () => {
    const result = validateTaskTitle("x".repeat(TASK_TITLE_MAX_LENGTH + 1));
    expect(result).toEqual({
      error: `Le nom du monstre est trop long (${TASK_TITLE_MAX_LENGTH} caractères max).`,
    });
  });
});
