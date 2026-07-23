import { describe, expect, test } from "vitest";
import { validateClientRegistration } from "./oauth-client-registration";

describe("validateClientRegistration (US-22 - RFC 7591)", () => {
  test("valide : redirect_uris + client_name", () => {
    const result = validateClientRegistration({
      redirect_uris: ["https://gemini.google.com/callback"],
      client_name: "Gemini",
    });
    expect(result).toEqual({
      registration: { clientName: "Gemini", redirectUris: ["https://gemini.google.com/callback"] },
    });
  });

  test("valide : client_name absent -> valeur par defaut", () => {
    const result = validateClientRegistration({ redirect_uris: ["https://client.example/callback"] });
    expect(result).toEqual({
      registration: { clientName: "Client MCP", redirectUris: ["https://client.example/callback"] },
    });
  });

  test("valide : plusieurs redirect_uris", () => {
    const result = validateClientRegistration({
      redirect_uris: ["https://a.example/cb", "https://b.example/cb"],
    });
    expect("registration" in result && result.registration.redirectUris).toEqual([
      "https://a.example/cb",
      "https://b.example/cb",
    ]);
  });

  test("erreur : body qui n'est pas un objet", () => {
    expect(validateClientRegistration("pas un objet")).toEqual({ error: "redirect_uris est requis." });
    expect(validateClientRegistration(null)).toEqual({ error: "redirect_uris est requis." });
  });

  test("erreur : redirect_uris absent", () => {
    const result = validateClientRegistration({});
    expect("error" in result).toBe(true);
  });

  test("erreur : redirect_uris vide", () => {
    const result = validateClientRegistration({ redirect_uris: [] });
    expect("error" in result).toBe(true);
  });

  test("erreur : un redirect_uri n'est pas une URL valide", () => {
    const result = validateClientRegistration({ redirect_uris: ["pas-une-url"] });
    expect("error" in result).toBe(true);
  });

  test("erreur : client_name vide", () => {
    const result = validateClientRegistration({
      redirect_uris: ["https://client.example/callback"],
      client_name: "   ",
    });
    expect("error" in result).toBe(true);
  });

  test("erreur : client_name trop long (> 200 caracteres)", () => {
    const result = validateClientRegistration({
      redirect_uris: ["https://client.example/callback"],
      client_name: "x".repeat(201),
    });
    expect("error" in result).toBe(true);
  });
});
