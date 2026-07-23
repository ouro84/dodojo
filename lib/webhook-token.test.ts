import { describe, expect, test } from "vitest";
import { generateWebhookToken, hashWebhookToken, verifyWebhookToken } from "./webhook-token";

describe("generateWebhookToken (US-03)", () => {
  test("génère un token hexadécimal de 64 caractères (256 bits)", () => {
    const token = generateWebhookToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  test("deux appels génèrent des tokens différents", () => {
    expect(generateWebhookToken()).not.toBe(generateWebhookToken());
  });
});

describe("hashWebhookToken", () => {
  test("déterministe : même token → même hash", () => {
    const token = "a".repeat(64);
    expect(hashWebhookToken(token)).toBe(hashWebhookToken(token));
  });

  test("deux tokens différents → hash différents", () => {
    expect(hashWebhookToken("a".repeat(64))).not.toBe(hashWebhookToken("b".repeat(64)));
  });

  test("produit un hex SHA-256 (64 caractères)", () => {
    expect(hashWebhookToken("token-de-test")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyWebhookToken", () => {
  const token = generateWebhookToken();
  const hash = hashWebhookToken(token);

  test("token valide contre son hash → true", () => {
    expect(verifyWebhookToken(token, hash)).toBe(true);
  });

  test("mauvais token contre le hash → false", () => {
    expect(verifyWebhookToken(generateWebhookToken(), hash)).toBe(false);
  });

  test("hash absent (aucun token généré) → false", () => {
    expect(verifyWebhookToken(token, null)).toBe(false);
    expect(verifyWebhookToken(token, undefined)).toBe(false);
  });

  test("token vide → false", () => {
    expect(verifyWebhookToken("", hash)).toBe(false);
  });

  test("hash stocké malformé (longueur différente) → false, ne plante pas", () => {
    expect(verifyWebhookToken(token, "deadbeef")).toBe(false);
  });
});
