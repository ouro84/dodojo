export interface ConsentPageParams {
  clientName: string;
  scope: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hiddenField(name: string, value: string): string {
  return '<input type="hidden" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '" />';
}

// US-22 : ecran de consentement OAuth (design : "Gemini veut ajouter des
// taches a ta place - Autoriser ?"). HTML minimal genere cote serveur (pas
// de composant React : ce endpoint doit rester un Route Handler testable en
// Vitest sans moteur de rendu React, cf. Global Constraints du plan).
export function renderConsentPage(params: ConsentPageParams): string {
  const hidden = [
    hiddenField("client_id", params.clientId),
    hiddenField("redirect_uri", params.redirectUri),
    hiddenField("code_challenge", params.codeChallenge),
    hiddenField("code_challenge_method", params.codeChallengeMethod),
    hiddenField("scope", params.scope),
    hiddenField("state", params.state ?? ""),
  ].join("\n        ");

  return [
    "<!doctype html>",
    '<html lang="fr">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>Autoriser " + escapeHtml(params.clientName) + " - Dodojo</title>",
    "  </head>",
    "  <body>",
    "    <main>",
    "      <h1>" + escapeHtml(params.clientName) + " veut ajouter des taches a ta place</h1>",
    "      <p>Portee demandee : " + escapeHtml(params.scope) + "</p>",
    "      <p>Cette identite est declaree par l'application elle-meme et n'est pas verifiee par Dodojo. N'autorise que si tu reconnais l'app que tu viens de connecter.</p>",
    '      <form method="POST" action="/oauth/authorize">',
    "        " + hidden,
    '        <button type="submit" name="decision" value="approve">Autoriser</button>',
    '        <button type="submit" name="decision" value="deny">Refuser</button>',
    "      </form>",
    "    </main>",
    "  </body>",
    "</html>",
  ].join("\n");
}

export function renderErrorPage(message: string): string {
  return [
    "<!doctype html>",
    '<html lang="fr">',
    "  <head><meta charset=\"utf-8\" /><title>Erreur d'autorisation - Dodojo</title></head>",
    "  <body><main><h1>Autorisation refusee</h1><p>" + escapeHtml(message) + "</p></main></body>",
    "</html>",
  ].join("\n");
}
