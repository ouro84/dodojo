import { describe, expect, test } from "vitest";
import {
  ACCESS_TOKEN_TTL_MS,
  AUTHORIZATION_CODE_TTL_MS,
  expiresAtFromNow,
  generateOpaqueToken,
  hashOpaqueToken,
  isExpired,
} from "./oauth-tokens";

describe("generateOpaqueToken (US-22)", () => {
  test("genere un jeton hexadecimal de 64 caracteres (256 bits)", () => {
    expect(generateOpaqueToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  test("deux appels generent des jetons differents", () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });
});

describe("hashOpaqueToken", () => {
  test("deterministe : meme jeton -> meme hash", () => {
    const token = "a".repeat(64);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  test("deux jetons differents -> hash differents", () => {
    expect(hashOpaqueToken("a".repeat(64))).not.toBe(hashOpaqueToken("b".repeat(64)));
  });

  test("produit un hex SHA-256 (64 caracteres)", () => {
    expect(hashOpaqueToken("code-de-test")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("expiresAtFromNow / isExpired", () => {
  test("expiresAtFromNow ajoute exactement le TTL en millisecondes", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    expect(expiresAtFromNow(AUTHORIZATION_CODE_TTL_MS, now)).toBe("2026-07-22T12:01:00.000Z");
    expect(expiresAtFromNow(ACCESS_TOKEN_TTL_MS, now)).toBe("2026-07-22T13:00:00.000Z");
  });

  test("isExpired : false avant l'expiration", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const expiresAt = expiresAtFromNow(ACCESS_TOKEN_TTL_MS, now);
    const before = new Date("2026-07-22T12:30:00.000Z");
    expect(isExpired(expiresAt, before)).toBe(false);
  });

  test("isExpired : true apres l'expiration", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const expiresAt = expiresAtFromNow(AUTHORIZATION_CODE_TTL_MS, now);
    const after = new Date("2026-07-22T12:02:00.000Z");
    expect(isExpired(expiresAt, after)).toBe(true);
  });

  test("isExpired : true pile a l'instant d'expiration (limite inclusive)", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const expiresAt = expiresAtFromNow(AUTHORIZATION_CODE_TTL_MS, now);
    const atExpiry = new Date("2026-07-22T12:01:00.000Z");
    expect(isExpired(expiresAt, atExpiry)).toBe(true);
  });
});
