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

  test("affiche le nom du client et le droit derive du scope demande", () => {
    const html = renderConsentPage(baseParams);
    expect(html).toContain("Gemini veut accéder à ton compte Dodojo");
    expect(html).toContain("Créer et cocher des tâches");
  });

  test("affiche une ligne de liste par scope accorde (Task 4, issue #201)", () => {
    const html = renderConsentPage(Object.assign({}, baseParams, { scope: "tasks:read tasks:write" }));
    expect(html).toContain("<li>Lire tes tâches, ton Boss et ta série</li>");
    expect(html).toContain("<li>Créer et cocher des tâches</li>");
    expect(html).not.toContain("Changer ton combattant équipé");
  });

  test("scope invalide : repli defensif sur la portee brute plutot que de planter", () => {
    const html = renderConsentPage(Object.assign({}, baseParams, { scope: "openid tasks:write" }));
    expect(html).toContain("Portée demandée : openid tasks:write");
  });

  test("avertit que l'identite du client n'est pas verifiee (audit #67, PR5)", () => {
    const html = renderConsentPage(baseParams);
    expect(html).toContain("n'est pas vérifiée par Dodojo");
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
