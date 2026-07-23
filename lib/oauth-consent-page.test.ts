import { describe, expect, test } from "vitest";
import { renderConsentPage, renderErrorPage } from "./oauth-consent-page";

describe("renderConsentPage (US-22)", () => {
  const baseParams = {
    clientName: "Gemini",
    scope: "tasks:write",
    clientId: "11111111-1111-1111-1111-111111111111",
    redirectUri: "https://gemini.google.com/callback",
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    codeChallengeMethod: "S256",
    state: "xyz",
  };

  test("affiche le nom du client et la portee demandee", () => {
    const html = renderConsentPage(baseParams);
    expect(html).toContain("Gemini veut ajouter des taches a ta place");
    expect(html).toContain("tasks:write");
  });

  test("porte les champs caches necessaires a la reconstruction de la requete", () => {
    const html = renderConsentPage(baseParams);
    expect(html).toContain('name="client_id" value="11111111-1111-1111-1111-111111111111"');
    expect(html).toContain('name="redirect_uri" value="https://gemini.google.com/callback"');
    expect(html).toContain('name="code_challenge" value="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"');
    expect(html).toContain('name="code_challenge_method" value="S256"');
    expect(html).toContain('name="state" value="xyz"');
  });

  test("echappe un client_name malveillant (protection XSS)", () => {
    const html = renderConsentPage(Object.assign({}, baseParams, { clientName: "<script>alert(1)</script>" }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderErrorPage", () => {
  test("affiche le message d'erreur echappe", () => {
    const html = renderErrorPage("redirect_uri non enregistre <img>");
    expect(html).toContain("redirect_uri non enregistre");
    expect(html).not.toContain("<img>");
  });
});
