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

  test("erreur : redirect_uri en http:// non-loopback rejeté (audit #67, PR5)", () => {
    const result = validateClientRegistration({
      redirect_uris: ["http://evil.example.com/callback"],
    });
    expect("error" in result).toBe(true);
  });

  test("erreur : schéma javascript: rejeté (audit #67, PR5)", () => {
    const result = validateClientRegistration({ redirect_uris: ["javascript:alert(1)"] });
    expect("error" in result).toBe(true);
  });

  test("valide : http://127.0.0.1 (loopback, client natif RFC 8252)", () => {
    const result = validateClientRegistration({
      redirect_uris: ["http://127.0.0.1:8080/callback"],
    });
    expect("registration" in result).toBe(true);
  });

  test("valide : http://localhost (loopback, client natif RFC 8252)", () => {
    const result = validateClientRegistration({
      redirect_uris: ["http://localhost:8080/callback"],
    });
    expect("registration" in result).toBe(true);
  });

  // Constate en branchant un vrai client MCP le 2026-09-07 : l'enregistrement
  // echouait en `invalid_client_metadata`. Le durcissement de l'audit #67
  // n'autorisait que https + loopback IPv4/localhost, alors que RFC 8252 —
  // cite par ce meme durcissement — decrit trois formes de redirection.
  test("valide : schema prive court (RFC 8252 §7.1) — cas `claude://`", () => {
    const result = validateClientRegistration({ redirect_uris: ["claude://oauth/callback"] });
    expect("registration" in result).toBe(true);
  });

  test("valide : schema prive reverse-DNS (RFC 8252 §7.1)", () => {
    const result = validateClientRegistration({
      redirect_uris: ["com.anthropic.claude:/oauth2redirect"],
    });
    expect("registration" in result).toBe(true);
  });

  test("valide : loopback IPv6 `http://[::1]` (RFC 8252 §7.3 l'exige au meme titre qu'IPv4)", () => {
    const result = validateClientRegistration({ redirect_uris: ["http://[::1]:8080/callback"] });
    expect("registration" in result).toBe(true);
  });

  // Ecart assume a OAuth 2.1 (qui exige HTTPS hors loopback), decide le
  // 2026-09-07 : un client MCP auto-heberge s'annoncait sur une IP de LAN en
  // clair. Tenable uniquement parce que PKCE S256 est obligatoire, le code a
  // usage unique et son TTL de 60 s — cf. le commentaire de la fonction.
  test.each([
    "http://192.168.1.212:9119/api/mcp/oauth/callback/dodojo", // le cas reel rencontre
    "http://10.0.0.5:3000/cb",
    "http://172.16.4.9:3000/cb",
    "http://172.31.255.254:3000/cb",
    "http://[fd00::1]:3000/cb",
  ])("valide : plage privee en http — %s", (uri) => {
    expect("registration" in validateClientRegistration({ redirect_uris: [uri] })).toBe(true);
  });

  // Les bornes comptent : 172.15 et 172.32 sont HORS 172.16.0.0/12, et une IP
  // publique en clair reste refusee — c'est ce qui distingue l'ecart assume
  // d'un simple "on accepte http".
  test.each([
    "http://172.15.0.1:3000/cb",
    "http://172.32.0.1:3000/cb",
    "http://11.0.0.1:3000/cb",
    "http://193.168.0.1:3000/cb",
    "http://8.8.8.8/cb",
    "http://999.1.1.1/cb",
    "http://evil.example.com/callback",
  ])("erreur : http hors loopback et hors plage privee — %s", (uri) => {
    expect("error" in validateClientRegistration({ redirect_uris: [uri] })).toBe(true);
  });

  test.each(["javascript:alert(1)", "data:text/html,x", "vbscript:msgbox", "file:///etc/passwd", "blob:https://x/y"])(
    "erreur : schema jamais legitime rejete — %s",
    (uri) => {
      expect("error" in validateClientRegistration({ redirect_uris: [uri] })).toBe(true);
    },
  );

  // Un refus opaque ("une URL absolue valide", sans dire laquelle) a coute un
  // diagnostic complet cote integrateur : le corps de la requete n'est pas
  // journalise non plus, donc personne ne pouvait voir la valeur envoyee.
  test("le message d'erreur nomme l'URI fautive", () => {
    const result = validateClientRegistration({
      redirect_uris: ["https://ok.example/cb", "http://evil.example.com/callback"],
    });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("http://evil.example.com/callback");
      expect(result.error).not.toContain("https://ok.example/cb");
    }
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
